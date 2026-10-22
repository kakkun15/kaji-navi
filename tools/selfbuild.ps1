$ErrorActionPreference = 'Stop'
$code = $env:KCODE; $src = $env:KSRC; $base = $env:KBASE
$u = New-Object System.Text.UTF8Encoding($false)
$h = [IO.File]::ReadAllText("$src\dist\app.html", $u)
$b = [IO.File]::ReadAllText("$code\kaji-self\build.py", $u)
$panel = [regex]::Match($b, "PANEL = '''(.*?)'''", 'Singleline').Groups[1].Value
$css = [regex]::Match($b, "CSS = '''(.*?)'''", 'Singleline').Groups[1].Value
if (-not $panel -or -not $css) { throw 'kaji-self\build.py: PANEL/CSS not found' }
$reader = [IO.File]::ReadAllText("$code\kaji\reader.js", $u)
$read = [IO.File]::ReadAllText("$code\kaji-self\read.js", $u)
if (-not $h.Contains('<!--SELF-PANEL-->') -or -not $h.Contains('<!--SELF-SCRIPTS-->')) { throw 'app.html: SELF markers not found' }
$scripts = "<script id=`"reader-src`">`n" + $reader + "`n</script>`n<script>`n" + $read + "`n</script>"
$h = $h.Replace('<!--SELF-PANEL-->', $panel).Replace('<!--SELF-SCRIPTS-->', $scripts)
$i = $h.IndexOf('</head>'); $h = $h.Substring(0, $i) + $css + "`n" + $h.Substring($i)
$h = $h.Replace('<title>鍛冶ナビ</title>', '<title>鍛冶ナビ 自分用</title>')
New-Item -ItemType Directory -Force "$code\kaji-self\dist" | Out-Null
[IO.File]::WriteAllText("$code\kaji-self\dist\kaji-navi-self.html", $h, $u)
[IO.File]::WriteAllText("$base\kaji-navi-self.html", $h, $u)
Write-Output ("OK " + $h.Length)
