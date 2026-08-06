/**
 * GitHub Contents API — 浏览器端客户端
 * 参考 Decap CMS 架构：读走 raw URL（免费实时），写走 Contents API
 *
 * 用法：<script src="/js/gh-client.js">
 *       var api = GitHubAPI.get();
 *       var files = await api.listDir("src/content/moments");
 *       var content = await api.getContent("src/content/moments/2026-08-01.md");
 *       await api.saveFile("src/content/moments/2026-08-01.md", fm, body);
 *       await api.deleteFile("src/content/moments/2026-08-01.md", sha);
 */
(function() {
  var TOKEN_KEY = "gh_admin_token";
  var OWNER = "tianshihao2003";
  var REPO = "dumplingandcakeblog";
  var BRANCH = "main";

  function GitHubAPI(token) {
    this.token = token;
    this.base = "https://api.github.com/repos/" + OWNER + "/" + REPO + "/contents";
    this.branch = BRANCH;
  }

  // ─── 本地缓存（参考 Decap CMS localForage 模式，5 分钟 TTL）──

  var CACHE_PREFIX = "gh_cache_";
  var CACHE_TTL = 5 * 60 * 1000; // 5 分钟

  function cacheGet(key) {
    try {
      var raw = localStorage.getItem(CACHE_PREFIX + key);
      if (!raw) return null;
      var data = JSON.parse(raw);
      if (Date.now() > data.expires) { localStorage.removeItem(CACHE_PREFIX + key); return null; }
      return data.value;
    } catch(e) { return null; }
  }

  function cacheSet(key, value) {
    try { localStorage.setItem(CACHE_PREFIX + key, JSON.stringify({ value: value, expires: Date.now() + CACHE_TTL })); } catch(e) {}
  }

  function cacheClearAll() {
    try {
      var keys = [];
      for (var i = 0; i < localStorage.length; i++) {
        var k = localStorage.key(i);
        if (k && k.indexOf(CACHE_PREFIX) === 0) keys.push(k);
      }
      keys.forEach(function(k) { localStorage.removeItem(k); });
    } catch(e) {}
  }

  GitHubAPI.prototype._headers = function() {
    return {
      Authorization: "Bearer " + this.token,
      Accept: "application/vnd.github+json",
    };
  };

  // ─── 指数退避重试（参考 Decap CMS）───────────────

  GitHubAPI.prototype._request = async function(url, options) {
    var retries = 2;
    for (var attempt = 0; attempt <= retries; attempt++) {
      var controller = new AbortController();
      var timer = setTimeout(function() { controller.abort(); }, 20000);
      try {
        var resp = await fetch(url, Object.assign({}, options, { signal: controller.signal }));
        clearTimeout(timer);
        return resp;
      } catch (e) {
        clearTimeout(timer);
        if (attempt < retries) {
          // 指数退避：1s → 2s → 4s
          await new Promise(function(r) { setTimeout(r, 1000 * Math.pow(2, attempt)); });
          continue;
        }
        throw new APIError(e.message || "Network error", 0, url);
      }
    }
  };

  // ─── 结构化错误（参考 Decap CMS APIError）─────────

  function APIError(message, status, url) {
    this.message = message;
    this.status = status || 0;
    this.url = url || "";
    this.name = "APIError";
  }
  APIError.prototype = new Error();

  // ─── base64 ↔ UTF-8 ──────────────────────────────

  function b64ToUTF8(b64) {
    var binary = atob(b64);
    var bytes = new Uint8Array(binary.length);
    for (var i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return new TextDecoder("utf-8").decode(bytes);
  }

  function utf8ToB64(str) {
    return btoa(unescape(encodeURIComponent(str)));
  }

  // ─── 读文件内容（用 Contents API，支持 CORS + 私有仓库）──
  // 注意：raw.githubusercontent.com 带 Authorization header 会触发 CORS preflight，
  //       raw URL 不支持预检，所以读内容也用 Contents API

  GitHubAPI.prototype.getContent = async function(path) {
    var file = await this.getFile(path);
    return file ? file.content : null;
  };

  // ─── 获取文件元数据（Contents API，用于拿 SHA + 内容）──

  GitHubAPI.prototype.getFile = async function(path) {
    var cacheKey = "file:" + path;
    var cached = cacheGet(cacheKey);
    if (cached) return cached;
    var url = this.base + "/" + encodeURI(path) + "?ref=" + this.branch;
    var resp = await this._request(url, { headers: this._headers() });
    if (resp.status === 404) return null;
    if (!resp.ok) throw new APIError("HTTP " + resp.status + ": " + path, resp.status);
    var data = await resp.json();
    if (data.content && data.encoding === "base64") {
      var result = { content: b64ToUTF8(data.content), sha: data.sha || "" };
      cacheSet(cacheKey, result);
      return result;
    }
    return null;
  };

  // ─── 列出目录 ─────────────────────────────────────

  GitHubAPI.prototype.listDir = async function(dirPath) {
    var cacheKey = "dir:" + dirPath;
    var cached = cacheGet(cacheKey);
    if (cached) return cached;
    var url = this.base + "/" + encodeURI(dirPath) + "?ref=" + this.branch;
    var resp = await this._request(url, { headers: this._headers() });
    if (resp.status === 404) return [];
    if (!resp.ok) throw new APIError("HTTP " + resp.status + ": " + dirPath, resp.status);
    var result = await resp.json();
    cacheSet(cacheKey, result);
    return result;
  };

  // ─── 递归列出所有 .md 文件 ─────────────────────────

  GitHubAPI.prototype.listRecursive = async function(dirPath) {
    var result = [];
    var stack = [dirPath];
    while (stack.length) {
      var dir = stack.pop();
      var items = await this.listDir(dir);
      for (var i = 0; i < items.length; i++) {
        if (items[i].type === "dir") stack.push(dir + "/" + items[i].name);
        else if (items[i].name.endsWith(".md")) {
          result.push({ path: dir + "/" + items[i].name, name: items[i].name, sha: items[i].sha });
        }
      }
    }
    return result;
  };

  // ─── 列出子目录名 ─────────────────────────────────

  GitHubAPI.prototype.listSubdirs = async function(dirPath) {
    var items = await this.listDir(dirPath);
    return items.filter(function(i) { return i.type === "dir"; }).map(function(i) { return i.name; });
  };

  // ─── Git Trees API：1 次拿整个仓库的文件树（含所有文件 SHA）──
  // 参考 Decap CMS：/repos/{owner}/{repo}/git/trees/{branch}?recursive=1
  // 返回指定目录下所有 .md 文件，10 万条上限，个人博客足够

  GitHubAPI.prototype.listTree = async function(dirPrefix) {
    var cacheKey = "tree:" + dirPrefix;
    var cached = cacheGet(cacheKey);
    if (cached) return cached;
    var url = "https://api.github.com/repos/" + OWNER + "/" + REPO + "/git/trees/" + BRANCH + "?recursive=1";
    var resp = await this._request(url, { headers: this._headers() });
    if (!resp.ok) throw new APIError("HTTP " + resp.status + ": " + dirPrefix, resp.status);
    var data = await resp.json();
    var prefix = dirPrefix.replace(/\/+$/, "") + "/";
    var files = (data.tree || [])
      .filter(function(item) {
        return item.type === "blob" && item.path.indexOf(prefix) === 0 && item.path.endsWith(".md");
      })
      .map(function(item) {
        return { path: item.path, name: item.path.split("/").pop(), sha: item.sha, size: item.size || 0 };
      });
    cacheSet(cacheKey, files);
    return files;
  };

  // ─── 写入文件 ─────────────────────────────────────

  GitHubAPI.prototype.saveFile = async function(path, content, sha) {
    var body = {
      message: sha ? "admin: update " + path.split("/").pop() : "admin: create " + path.split("/").pop(),
      content: utf8ToB64(content),
      branch: this.branch,
    };
    if (sha) body.sha = sha;

    var url = this.base + "/" + encodeURI(path);
    var resp = await this._request(url, {
      method: "PUT",
      headers: Object.assign(this._headers(), { "Content-Type": "application/json" }),
      body: JSON.stringify(body),
    });
    if (!resp.ok) throw new APIError("HTTP " + resp.status + ": " + path, resp.status);
    cacheClearAll(); // 写入后清缓存，下次读取最新
    return true;
  };

  // ─── 删除文件 ─────────────────────────────────────

  GitHubAPI.prototype.deleteFile = async function(path, sha) {
    var url = this.base + "/" + encodeURI(path);
    var resp = await this._request(url, {
      method: "DELETE",
      headers: Object.assign(this._headers(), { "Content-Type": "application/json" }),
      body: JSON.stringify({ message: "admin: delete " + path.split("/").pop(), sha: sha, branch: this.branch }),
    });
    if (!resp.ok) throw new APIError("HTTP " + resp.status + ": " + path, resp.status);
    cacheClearAll(); // 删除后清缓存，下次读取最新
    return true;
  };

  // ─── Singleton ─────────────────────────────────

  GitHubAPI.get = function() {
    if (!GitHubAPI._instance) {
      var token = localStorage.getItem(TOKEN_KEY) || "";
      GitHubAPI._instance = new GitHubAPI(token);
    }
    return GitHubAPI._instance;
  };

  GitHubAPI.isReady = function() {
    var token = localStorage.getItem(TOKEN_KEY) || "";
    return token.startsWith("ghp_") || token.startsWith("github_pat_");
  };

  window.GitHubAPI = GitHubAPI;
})();

// ─── Frontmatter 工具 ───────────────────────────

(function() {
  var FM = {};

  FM.parse = function(raw) {
    if (!raw.startsWith("---\n")) return { frontmatter: {}, body: raw };
    var endIdx = raw.indexOf("\n---\n", 4);
    if (endIdx === -1) return { frontmatter: {}, body: raw };
    var fmLines = raw.slice(4, endIdx).split("\n");
    var body = raw.slice(endIdx + 5).trimStart();
    var fm = {};
    var key = "", isArray = false, arr = [];
    for (var i = 0; i < fmLines.length; i++) {
      var line = fmLines[i];
      var am = line.match(/^  -\s+(.+)$/);
      if (am && isArray) { arr.push(am[1].replace(/^"(.*)"$/,"$1")); continue; }
      if (isArray) { fm[key] = arr; isArray = false; arr = []; key = ""; }
      var km = line.match(/^([a-zA-Z_]\w*):\s*(.*)$/);
      if (km) {
        var k2 = km[1], v2 = km[2].trim();
        if (!v2) { key = k2; isArray = true; arr = []; }
        else if (v2 === "true") fm[k2] = true;
        else if (v2 === "false") fm[k2] = false;
        else if (/^-?\d+$/.test(v2)) fm[k2] = parseInt(v2);
        else if (/^-?\d+\.?\d*$/.test(v2)) fm[k2] = parseFloat(v2);
        else fm[k2] = v2.replace(/^"(.*)"$/,"$1").replace(/\\"/g,'"');
      }
    }
    if (isArray) fm[key] = arr;
    return { frontmatter: fm, body: body };
  };

  FM.stringify = function(fm, body) {
    var lines = ["---"];
    Object.keys(fm).forEach(function(key) {
      var value = fm[key];
      if (value == null || value === "") return;
      if (Array.isArray(value)) {
        if (!value.length) return;
        lines.push(key + ":");
        value.forEach(function(item) {
          lines.push('  - "' + String(item).replace(/\\/g,"\\\\").replace(/"/g,'\\"') + '"');
        });
      } else if (typeof value === "boolean") {
        lines.push(key + ": " + value);
      } else if (typeof value === "number") {
        lines.push(key + ": " + value);
      } else {
        lines.push(key + ": " + String(value));
      }
    });
    lines.push("---");
    return lines.join("\n") + "\n\n" + (body || "");
  };

  window.FrontmatterUtil = FM;
})();