# ALEC Live — laboratório independente
Protótipo de áudio bidireccional baseado na documentação pública do Gemini Live API, sem reutilização do código do Brahma Echo. Não substitui a aplicação Desktop e não activa funções do computador. Não há fallback automático, agentes, TTS externo nem modelo local carregado pelo laboratório.

## Windows / Node 22+
Fecha ou suspende a escuta do ALEC antes de experimentar, para evitar concorrência pelo microfone. Em PowerShell:
```powershell
cd desktop-redesign/live
$secret = Read-Host 'Chave Gemini API' -AsSecureString
$env:ALEC_LIVE_API_KEY = [System.Net.NetworkCredential]::new('', $secret).Password
$env:ALEC_LIVE_MODEL = 'gemini-3.1-flash-live-preview'
$env:ALEC_LIVE_CONSENT = 'yes'
node server.mjs
```
Escolhe um modelo Live suportado pela tua conta; confirma primeiro os preços e a disponibilidade no Google AI Studio. Abre o URL local impresso no terminal e inicia a sessão. O URL contém um segredo local temporário: não partilhar. A chave permanece no processo Node e não é enviada ao browser. Encerra com Ctrl+C e remove a variável com `Remove-Item Env:ALEC_LIVE_API_KEY`. O áudio é enviado para Google apenas durante a sessão explicitamente iniciada; não gravado no disco pelo laboratório. Máximo 10 minutos por sessão; sem reconexão automática. O browser solicita AEC; qualidade depende do hardware. A interrupção limpa imediatamente a fila local ao receber a indicação do servidor. Usar auscultadores se houver eco.
```powershell
node --test transport.test.mjs
```
A integração nativa com Orb, selecção Local/Live, histórico, Trust Engine e testes reais de voz fica para a fase posterior; não é um instalador.
Docs: https://ai.google.dev/api/live e https://ai.google.dev/gemini-api/docs/live
