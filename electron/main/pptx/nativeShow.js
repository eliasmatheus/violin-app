"use strict";

/**
 * nativeShow — o próprio PowerPoint apresenta, com animações, vídeos e áudios.
 *
 * O modo imagem (index.js) é fiel e leva o slide ao PA e ao retorno, mas cada
 * slide vira uma página parada. Quando o arquivo depende de animação ou mídia,
 * o operador escolhe este modo: o PowerPoint abre a apresentação em tela cheia
 * no monitor do PA e o LouvorJA só manda os comandos (próximo, anterior, ir
 * para, tela preta) e lê em que slide ele está.
 *
 * Windows apenas (COM). Um PowerShell fica aberto durante a apresentação:
 * pedido em JSON (base64, uma linha por comando) pela entrada padrão, resposta
 * em JSON pela saída padrão.
 */
const fs = require("fs/promises");
const path = require("path");
const crypto = require("crypto");
const { spawn } = require("child_process");

const SCRIPT = String.raw`
$ErrorActionPreference = 'Stop'
$stdout = [Console]::OpenStandardOutput()
function Send($obj) {
    $json = ConvertTo-Json -InputObject $obj -Compress -Depth 6
    $bytes = [Text.Encoding]::UTF8.GetBytes($json + [char]10)
    $stdout.Write($bytes, 0, $bytes.Length)
    $stdout.Flush()
}

$script:ppt = $null
$script:owns = $false
$script:pres = $null
$script:win = $null

function Get-PPT {
    if ($script:ppt -ne $null) {
        try { $null = $script:ppt.Version; return $script:ppt } catch { $script:ppt = $null }
    }
    try {
        $script:ppt = [Runtime.InteropServices.Marshal]::GetActiveObject('PowerPoint.Application')
        $script:owns = $false
    } catch {
        for ($t = 1; $t -le 3; $t++) {
            try { $script:ppt = New-Object -ComObject PowerPoint.Application; $script:owns = $true; break }
            catch {
                if ($t -lt 3) { Start-Sleep -Seconds 2; continue }
                if ($_.Exception.Message -match '80080005|CO_E_SERVER_EXEC_FAILURE') {
                    throw ('O Windows nao deixou o LouvorJA conversar com o PowerPoint. Abra os dois do jeito normal ' +
                           '(nenhum como administrador) ou finalize POWERPNT.EXE no Gerenciador de Tarefas.')
                }
                throw
            }
        }
    }
    return $script:ppt
}

function Get-State {
    if ($script:win -eq $null) { return @{ active = $false } }
    try {
        $v = $script:win.View
        $st = [int]$v.State      # 1 rodando, 2 pausado, 3 tela preta, 4 tela branca, 5 terminou
        if ($st -eq 5) { throw 'fim' }
        return @{
            active = $true
            index  = ([int]$v.CurrentShowPosition) - 1
            total  = [int]$script:pres.Slides.Count
            black  = ($st -eq 3)
        }
    } catch {
        Stop-Show | Out-Null
        return @{ active = $false }
    }
}

function Stop-Show {
    if ($script:win -ne $null) { try { $script:win.View.Exit() } catch { } }
    if ($script:pres -ne $null) { try { $script:pres.Close() } catch { } }
    $script:win = $null; $script:pres = $null
    if ($script:owns -and $script:ppt -ne $null) {
        try { if ($script:ppt.Presentations.Count -eq 0) { $script:ppt.Quit() } } catch { }
        $script:ppt = $null
    }
    return @{ active = $false }
}

function Start-Show($a) {
    Stop-Show | Out-Null
    $app = Get-PPT
    try { Unblock-File -LiteralPath ([string]$a.file) -ErrorAction SilentlyContinue } catch { }
    try {
        # Open(FileName, ReadOnly, Untitled, WithWindow): com janela, para as fontes embutidas valerem
        $pres = $app.Presentations.Open([string]$a.file, -1, 0, -1)
    } catch {
        throw ('O PowerPoint nao conseguiu abrir este arquivo. (' + $_.Exception.Message + ')')
    }
    if ($script:owns) { try { $app.WindowState = 2 } catch { } }   # minimizado
    $s = $pres.SlideShowSettings
    $s.ShowType = 1                 # ppShowTypeSpeaker (tela cheia)
    try { $s.ShowPresenterView = 0 } catch { }
    $s.StartingSlide = 1
    $s.EndingSlide = $pres.Slides.Count
    $w = $s.Run()
    # Posiciona no monitor do PA. Chega em DIP (px a 96 dpi); a janela usa pontos = DIP x 0,75
    if ($a.bounds -ne $null) {
        $b = $a.bounds
        try {
            $w.Left = [double]$b.x * 0.75
            $w.Top = [double]$b.y * 0.75
            $w.Width = [double]$b.width * 0.75
            $w.Height = [double]$b.height * 0.75
        } catch { }
    }
    # Ativa a apresentação uma vez: sem isso a barra de tarefas do Windows fica por cima do PA
    try { $w.Activate() } catch { }
    $script:pres = $pres
    $script:win = $w
    $i = [int]$a.startIndex
    if ($i -gt 0) { try { $w.View.GotoSlide($i + 1) } catch { } }
    return (Get-State)
}

function Nav($a) {
    if ($script:win -eq $null) { return @{ active = $false } }
    $v = $script:win.View
    switch ([string]$a.action) {
        'next'  { $v.Next() }
        'prev'  { $v.Previous() }
        'goto'  { $v.GotoSlide(([int]$a.index) + 1) }
        'black' { if ([int]$v.State -eq 3) { $v.State = 1 } else { $v.State = 3 } }
    }
    return (Get-State)
}

Send @{ id = 0; ok = $true; result = @{ ready = $true } }
$stdin = [Console]::In
while ($true) {
    $line = $stdin.ReadLine()
    if ($line -eq $null) { break }
    $line = $line.Trim()
    if ($line.Length -eq 0) { continue }
    $id = -1
    try {
        $msg = [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($line)) | ConvertFrom-Json
        $id = $msg.id
        $res = switch ([string]$msg.cmd) {
            'start' { Start-Show $msg.args }
            'nav'   { Nav $msg.args }
            'state' { Get-State }
            'end'   { Stop-Show }
            'quit'  { Stop-Show }
            default { throw "Comando desconhecido: $($msg.cmd)" }
        }
        Send @{ id = $id; ok = $true; result = $res }
        if ([string]$msg.cmd -eq 'quit') { break }
    } catch {
        Send @{ id = $id; ok = $false; error = $_.Exception.Message }
    }
}
`;

/** Ponte com um PowerShell que vive enquanto a apresentação nativa existe. */
class NativeShow {
  /**
   * @param {{tempDir: string, onState?: (s: object) => void, log?: (...a: any[]) => void}} opts
   */
  constructor({ tempDir, onState = () => {}, log = console.log }) {
    this.tempDir = tempDir;
    this.onState = onState;
    this.log = log;
    this.ps = null;
    this.pronto = null;
    this.seq = 0;
    this.pendentes = new Map();
    this.timer = null;
    this.ultimo = { active: false };
  }

  get supported() {
    return process.platform === "win32";
  }

  async _script() {
    const hash = crypto.createHash("sha1").update(SCRIPT).digest("hex").slice(0, 10);
    const file = path.join(this.tempDir, `louvorja-pptx-show-${hash}.ps1`);
    await fs.mkdir(this.tempDir, { recursive: true });
    await fs.writeFile(file, "﻿" + SCRIPT, "utf8");
    return file;
  }

  _iniciar() {
    if (this.pronto) return this.pronto;
    this.pronto = (async () => {
      const script = await this._script();
      const ps = spawn("powershell.exe", ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-File", script], {
        windowsHide: true,
      });
      this.ps = ps;
      ps.stdout.setEncoding("utf8");
      let pendente = "";
      await new Promise((resolve, reject) => {
        const falha = (e) => reject(e instanceof Error ? e : new Error(String(e)));
        ps.on("error", falha);
        ps.stdout.on("data", (txt) => {
          pendente += txt;
          let i;
          while ((i = pendente.indexOf("\n")) >= 0) {
            const linha = pendente.slice(0, i).trim();
            pendente = pendente.slice(i + 1);
            if (!linha) continue;
            let msg;
            try {
              msg = JSON.parse(linha);
            } catch {
              continue;
            }
            if (msg.id === 0) {
              resolve();
              continue;
            }
            const p = this.pendentes.get(msg.id);
            if (!p) continue;
            this.pendentes.delete(msg.id);
            if (msg.ok) p.resolve(msg.result || {});
            else p.reject(new Error(String(msg.error || "Falha no PowerPoint.")));
          }
        });
        ps.on("exit", () => {
          for (const p of this.pendentes.values()) p.reject(new Error("O PowerPoint parou de responder."));
          this.pendentes.clear();
          this.ps = null;
          this.pronto = null;
          this._pararConsulta();
          this._publicar({ active: false });
          falha(new Error("PowerShell encerrou."));
        });
      });
    })();
    this.pronto.catch(() => (this.pronto = null));
    return this.pronto;
  }

  async _chamar(cmd, args = {}, timeoutMs = 60000) {
    await this._iniciar();
    const id = ++this.seq;
    const linha = Buffer.from(JSON.stringify({ id, cmd, args }), "utf8").toString("base64");
    return new Promise((resolve, reject) => {
      const t = setTimeout(() => {
        this.pendentes.delete(id);
        reject(new Error("O PowerPoint demorou demais para responder."));
      }, timeoutMs);
      this.pendentes.set(id, {
        resolve: (r) => (clearTimeout(t), resolve(r)),
        reject: (e) => (clearTimeout(t), reject(e)),
      });
      this.ps.stdin.write(linha + "\n");
    });
  }

  _publicar(estado) {
    const s = estado && typeof estado === "object" ? estado : { active: false };
    const mudou = JSON.stringify(s) !== JSON.stringify(this.ultimo);
    this.ultimo = s;
    if (mudou) this.onState(s);
    if (!s.active) this._pararConsulta();
    return s;
  }

  /** Enquanto apresenta, pergunta o slide atual (o operador pode avançar pelo próprio PowerPoint). */
  _consultar() {
    this._pararConsulta();
    this.timer = setInterval(() => {
      this._chamar("state", {}, 10000)
        .then((s) => this._publicar(s))
        .catch(() => {});
    }, 700);
  }

  _pararConsulta() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  /**
   * @param {string} file  .pptx já sem a marca "baixado da internet"
   * @param {{x: number, y: number, width: number, height: number}|null} bounds  monitor do PA
   */
  async start(file, bounds, startIndex = 0) {
    const s = await this._chamar("start", { file, bounds, startIndex }, 3 * 60 * 1000);
    this._publicar(s);
    if (s.active) this._consultar();
    return s;
  }

  async nav(action, index) {
    if (!this.ultimo.active) return { active: false };
    return this._publicar(await this._chamar("nav", { action, index }));
  }

  state() {
    return this.ultimo;
  }

  async end() {
    this._pararConsulta();
    if (!this.ps) return this._publicar({ active: false });
    try {
      return this._publicar(await this._chamar("end", {}, 20000));
    } catch {
      return this._publicar({ active: false });
    }
  }

  /** Fecha o PowerShell (ao sair do app). */
  dispose() {
    this._pararConsulta();
    if (this.ps) {
      try {
        const linha = Buffer.from(JSON.stringify({ id: ++this.seq, cmd: "quit", args: {} })).toString("base64");
        this.ps.stdin.write(linha + "\n");
        setTimeout(() => this.ps?.kill(), 3000);
      } catch {
        /* já saiu */
      }
    }
  }
}

module.exports = { NativeShow, SCRIPT };
