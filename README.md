# ALEC — Activação «Olá Alec» para Roamies (Windows)

Compilação isolada de `roamies-voice.exe` para activar o Roamies com **«Olá Alec»** sem exigir «Hey Jarvis». O detector original mantém-se disponível. Não altera o `sidekick.mjs`, a voz clonada Fish Audio, a API Key, o nome do utilizador, a memória nem a interface.

## Compatibilidade

O workflow obtém o código-fonte oficial do Roamies **v0.1.49** e compila o módulo nativo Windows x64 no GitHub Actions. **A versão instalada tem de ser 0.1.49.** O instalador recusa substituir componentes de outra versão.

## Compilação

Abre [Actions](https://github.com/Mula-Edmilson/alec-ola-alec-build/actions), selecciona **ALEC - Compilar Ola Alec para Windows** e consulta a execução mais recente. Depois de uma execução verde, descarrega o artifact **ALEC-Ola-Alec-Windows**. O ZIP contém o novo executável, os dados de verificação SHA256 e o instalador PowerShell.

## Instalação

1. Extrai o ZIP numa pasta, sem executar o `.exe` isoladamente.
2. Abre PowerShell nessa pasta.
3. Executa:

```powershell
Unblock-File ".\Instalar-ALEC-Compilado.ps1"
& ".\Instalar-ALEC-Compilado.ps1"
```

4. Fecha **completamente** o Roamies quando solicitado (incluindo o ícone na bandeja).
5. Abre novamente o Roamies e confirma **Listening → Hands-free → Wake word = ON**.
6. Testa em voz normal: **«Olá Alec, que horas são?»**.

O nome exibido no painel poderá continuar a ser «Hey Jarvis»: a alteração é no reconhecedor de voz, não no texto da interface.

## Segurança e reversão

O instalador valida o SHA256 e a versão da aplicação, faz backup do executável original em `Downloads\Roamies-Ola-Alec\backup` e só então o substitui. Para restaurar, fecha o Roamies e executa `Restaurar-ALEC.ps1`. Uma actualização automática do Roamies pode desfazer esta personalização. O reconhecimento depende da transcrição efectuada pelo modelo Parakeet e da qualidade do microfone; um teste real no PC ainda é necessário.

Código-fonte original: [KenKaiii/Roamies](https://github.com/KenKaiii/Roamies). Este projecto é apenas uma personalização local, sem afiliação ao autor original.
