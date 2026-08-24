using System.IO;
using System.Text.Json;
using System.Windows.Forms;
using Microsoft.Web.WebView2.WinForms;

namespace Orbspeak.Ui;

internal static class Program
{
    [STAThread]
    private static void Main()
    {
        ApplicationConfiguration.Initialize();
        Application.Run(new MainForm());
    }
}

internal sealed class MainForm : Form
{
    private readonly WebView2 _webView;
    private EngineSession? _session;

    public MainForm()
    {
        _webView = new WebView2 { Dock = DockStyle.Fill };
        Controls.Add(_webView);
        Text = "Orbspeak";
        Size = new System.Drawing.Size(1280, 860);
        StartPosition = FormStartPosition.CenterScreen;
        Load += MainForm_Load;
    }

    private async void MainForm_Load(object? sender, EventArgs e)
    {
        try
        {
            await _webView.EnsureCoreWebView2Async().ConfigureAwait(true);

            var initScript = @"
(function() {
  function post(msg) {
    if (window.chrome && window.chrome.webview)
      window.chrome.webview.postMessage(JSON.stringify(msg));
  }
  var pending = {};
  window.__engineIpc = {
    _cbs: { partial: [], final: [], state: [], error: [], ttsState: [], ttsProgress: [] },
    onPartial: function(f) { this._cbs.partial.push(f); },
    onFinal: function(f) { this._cbs.final.push(f); },
    onState: function(f) { this._cbs.state.push(f); },
    onError: function(f) { this._cbs.error.push(f); },
    onTtsState: function(f) { this._cbs.ttsState.push(f); },
    onTtsProgress: function(f) { this._cbs.ttsProgress.push(f); },
    start: function(opts) {
      var o = opts || {};
      post({ type: 'dictation.start', profileId: o.profileId || 'default', mode: o.mode || 'default' });
    },
    stop: function() { post({ type: 'dictation.stop' }); },
    ttsSpeak: function(opts) { return this.request('tts.speak', opts || {}); },
    ttsPause: function() { return this.request('tts.pause', {}); },
    ttsResume: function() { return this.request('tts.resume', {}); },
    ttsStop: function() { return this.request('tts.stop', {}); },
    ttsVoices: function() { return this.request('tts.voices', {}); },
    settingsGet: function(key) { return this.request('settings.get', { key: key }); },
    settingsSet: function(values) { return this.request('settings.set', { values: values || {} }); },
    studioImport: function(p) { return this.request('studio.import', p); },
    studioList: function(p) { return this.request('studio.list', p); },
    studioGet: function(p) { return this.request('studio.get', p); },
    studioExportAudio: function(p) { return this.request('studio.exportAudio', p); },
    studioSaveStyle: function(p) { return this.request('studio.saveStyle', p); },
    studioGetStyle: function(p) { return this.request('studio.getStyle', p); },
    artworkGenerate: function(p) { return this.request('artwork.generate', p); },
    request: function(method, params) {
      var id = method + '-' + Date.now() + '-' + Math.random().toString(16).slice(2);
      return new Promise(function(resolve, reject) {
        pending[id] = { resolve: resolve, reject: reject };
        post({ type: 'ipc.request', id: id, method: method, params: params || {} });
      });
    }
  };
  if (window.chrome && window.chrome.webview) {
    window.chrome.webview.addEventListener('message', function(ev) {
      try {
        var d = ev.data;
        if (!d || !d.type) return;
        if (d.type === 'ipc.response') {
          var waiter = pending[d.id];
          if (!waiter) return;
          delete pending[d.id];
          if (d.ok) waiter.resolve(d.result);
          else waiter.reject(d.error || { message: 'Engine request failed' });
          return;
        }
        var p = d.payload != null ? (typeof d.payload === 'string' ? JSON.parse(d.payload) : d.payload) : null;
        var cbs = window.__engineIpc._cbs;
        if (d.type === 'partial' && cbs.partial) cbs.partial.forEach(function(f) { try { f(p); } catch(e) {} });
        else if (d.type === 'final' && cbs.final) cbs.final.forEach(function(f) { try { f(p); } catch(e) {} });
        else if (d.type === 'state' && cbs.state) cbs.state.forEach(function(f) { try { f(p); } catch(e) {} });
        else if (d.type === 'error' && cbs.error) cbs.error.forEach(function(f) { try { f(p); } catch(e) {} });
        else if (d.type === 'ttsState' && cbs.ttsState) cbs.ttsState.forEach(function(f) { try { f(p); } catch(e) {} });
        else if (d.type === 'ttsProgress' && cbs.ttsProgress) cbs.ttsProgress.forEach(function(f) { try { f(p); } catch(e) {} });
      } catch(e) {}
    });
  }
})();
";
            await _webView.CoreWebView2.AddScriptToExecuteOnDocumentCreatedAsync(initScript).ConfigureAwait(true);

            _session = new EngineSession();
            _session.Partial += (p) => PostToWebView("partial", p);
            _session.Final += (p) => PostToWebView("final", p);
            _session.State += (p) => PostToWebView("state", p);
            _session.Error += (p) => PostToWebView("error", p);
            _session.TtsState += (p) => PostToWebView("ttsState", p);
            _session.TtsProgress += (p) => PostToWebView("ttsProgress", p);

            _webView.WebMessageReceived += WebView_WebMessageReceived;

            var appPath = Path.GetFullPath(Path.Combine(AppContext.BaseDirectory, "app"));
            if (Directory.Exists(appPath))
            {
                _webView.CoreWebView2.SetVirtualHostNameToFolderMapping(
                    "app.local",
                    appPath,
                    Microsoft.Web.WebView2.Core.CoreWebView2HostResourceAccessKind.Allow);
                _webView.CoreWebView2.Navigate("https://app.local/index.html");
            }
            else
            {
                _webView.CoreWebView2.NavigateToString(
                    @"<html><body><p>Orbspeak app folder not found. Build the project to copy the React app to app\.</p></body></html>");
            }

            // Connect (and spawn if needed) the engine without blocking the UI.
            _ = ConnectEngineAsync();
        }
        catch (Exception ex)
        {
            _webView.CoreWebView2?.NavigateToString(
                $"<html><body><p>Failed to start: {ex.Message}</p></body></html>");
        }
    }

    private async Task ConnectEngineAsync()
    {
        if (_session is null) return;
        try
        {
            await _session.ConnectAsync().ConfigureAwait(true);
            UiLog.Write("engine connected");
        }
        catch (Exception ex)
        {
            UiLog.Write("engine connect failed", ex);
            var payload = JsonSerializer.SerializeToElement(
                new { code = "engine.connect", message = $"Engine unavailable: {ex.Message}" });
            PostToWebView("error", payload);
        }
    }

    private void PostToWebView(string type, JsonElement payload)
    {
        var json = JsonSerializer.Serialize(new { type, payload = payload.GetRawText() });
        void DoPost()
        {
            try { _webView.CoreWebView2?.PostWebMessageAsJson(json); } catch { }
        }
        if (InvokeRequired)
            BeginInvoke(DoPost);
        else
            DoPost();
    }

    private void PostResponse(string id, bool ok, object? result, object? error)
    {
        var json = JsonSerializer.Serialize(new { type = "ipc.response", id, ok, result, error });
        void DoPost()
        {
            try { _webView.CoreWebView2?.PostWebMessageAsJson(json); } catch { }
        }
        if (InvokeRequired)
            BeginInvoke(DoPost);
        else
            DoPost();
    }

    private void WebView_WebMessageReceived(object? sender, Microsoft.Web.WebView2.Core.CoreWebView2WebMessageReceivedEventArgs e)
    {
        if (_session is null)
        {
            UiLog.Write("webmessage dropped: session is null");
            return;
        }
        try
        {
            var raw = e.TryGetWebMessageAsString();
            UiLog.Write($"webmessage received: {(raw is null ? "<null>" : raw.Length > 200 ? raw[..200] : raw)}");
            if (string.IsNullOrEmpty(raw)) return;
            var d = JsonSerializer.Deserialize<JsonElement>(raw);
            var type = d.TryGetProperty("type", out var t) ? t.GetString() : null;
            if (type == "dictation.start")
            {
                var profileId = d.TryGetProperty("profileId", out var pid) ? pid.GetString() ?? "default" : "default";
                var mode = d.TryGetProperty("mode", out var m) ? m.GetString() ?? "default" : "default";
                _ = _session.StartDictationAsync(profileId, mode);
            }
            else if (type == "dictation.stop")
            {
                _ = _session.StopDictationAsync();
            }
            else if (type == "ipc.request")
            {
                var id = d.TryGetProperty("id", out var idProp) ? idProp.GetString() ?? "" : "";
                var method = d.TryGetProperty("method", out var methodProp) ? methodProp.GetString() ?? "" : "";
                object? parameters = d.TryGetProperty("params", out var p) ? JsonSerializer.Deserialize<object>(p.GetRawText()) : null;
                _ = ForwardRequestAsync(id, method, parameters);
            }
        }
        catch (Exception ex)
        {
            UiLog.Write("webmessage handler failed", ex);
        }
    }

    private async Task ForwardRequestAsync(string id, string method, object? parameters)
    {
        if (_session is null)
        {
            PostResponse(id, false, null, new { code = "engine.offline", message = "Engine is not connected." });
            return;
        }

        try
        {
            UiLog.Write($"forwarding {method} ({id})");
            var response = await _session.SendRequestAsync(method, parameters).ConfigureAwait(true);
            UiLog.Write($"forwarded {method} ({id}) ok={response.Ok}");
            PostResponse(id, response.Ok, response.Result, response.Error);
        }
        catch (Exception ex)
        {
            UiLog.Write($"forward {method} ({id}) failed", ex);
            PostResponse(id, false, null, new { code = "engine.error", message = ex.Message });
        }
    }

    protected override void OnFormClosing(FormClosingEventArgs e)
    {
        _session?.Disconnect();
        base.OnFormClosing(e);
    }
}
