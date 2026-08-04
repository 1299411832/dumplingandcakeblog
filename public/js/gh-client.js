/**
 * GitHub Contents API — 浏览器端客户端
 * 在 EdgeOne 纯静态部署中替代服务端 API 路由
 *
 * 用法：<script src="/js/gh-client.js">
 *       var api = GitHubAPI.get();
 *       var files = await api.listFiles("src/content/moments");
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

  GitHubAPI.prototype._headers = function() {
    return {
      Authorization: "Bearer " + this.token,
      Accept: "application/vnd.github+json",
    };
  };

  // 带超时 + 重试的请求（缓解国内直连 GitHub 不稳定）
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
          await new Promise(function(r) { setTimeout(r, 1200 * (attempt + 1)); });
          continue;
        }
        throw e;
      }
    }
  };

  // base64 → UTF-8（atob 只能处理 Latin-1，中文需要用 TextDecoder）
  function b64ToUTF8(b64) {
    var binary = atob(b64);
    var bytes = new Uint8Array(binary.length);
    for (var i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return new TextDecoder("utf-8").decode(bytes);
  }

  // UTF-8 → base64（btoa 只能处理 Latin-1）
  function utf8ToB64(str) {
    return btoa(unescape(encodeURIComponent(str)));
  }

  // 获取单文件（返回 { content, sha }）
  GitHubAPI.prototype.getFile = async function(path) {
    var url = this.base + "/" + encodeURI(path) + "?ref=" + this.branch;
    var resp = await this._request(url, { headers: this._headers() });
    if (resp.status === 404) return null;
    if (!resp.ok) throw new Error("HTTP " + resp.status + ": " + path);
    var data = await resp.json();
    if (data.content && data.encoding === "base64") {
      return { content: b64ToUTF8(data.content), sha: data.sha || "" };
    }
    return null;
  };

  // 列出目录（返回 [{ name, type, sha }]）
  GitHubAPI.prototype.listDir = async function(dirPath) {
    var url = this.base + "/" + encodeURI(dirPath) + "?ref=" + this.branch;
    var resp = await this._request(url, { headers: this._headers() });
    if (resp.status === 404) return [];
    if (!resp.ok) throw new Error("HTTP " + resp.status + ": " + dirPath);
    return resp.json();
  };

  // 递归列出所有 .md 文件
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

  // 列出子目录名
  GitHubAPI.prototype.listSubdirs = async function(dirPath) {
    var items = await this.listDir(dirPath);
    return items.filter(function(i) { return i.type === "dir"; }).map(function(i) { return i.name; });
  };

  // 写入文件
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
    if (!resp.ok) throw new Error("HTTP " + resp.status + ": " + path);
    return true;
  };

  // 删除文件
  GitHubAPI.prototype.deleteFile = async function(path, sha) {
    var url = this.base + "/" + encodeURI(path);
    var resp = await this._request(url, {
      method: "DELETE",
      headers: Object.assign(this._headers(), { "Content-Type": "application/json" }),
      body: JSON.stringify({ message: "admin: delete " + path.split("/").pop(), sha: sha, branch: this.branch }),
    });
    if (!resp.ok) throw new Error("HTTP " + resp.status + ": " + path);
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
