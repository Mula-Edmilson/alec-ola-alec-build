# ALEC — Activação «Olá Alec» para Roamies (Windows)

Compilação isolada de `roamies-voice.exe` para activar o Roamies com **«Olá Alec»** sem exigir «Hey Jarvis». A revisão V2 também reconhece variantes de transcrição, por exemplo «Olha Alex» e «Hello Alec». O detector original mantém-se disponível. Não altera o `sidekick.mjs`, a voz clonada Fish Audio, a API Key, o nome do utilizador, a memória nem a interface.

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

## Quando «Olá Alec» não é reconhecido (diagnóstico V2)

O reconhecimento depende de duas etapas: Parakeet transforma a fala em texto e o detector procura a expressão. Os testes Rust verificam a segunda etapa, não o teu microfone.

A revisão V2 inclui `Diagnosticar-ALEC.ps1`, com registo local das transcrições **desligado por defeito**. A utilização é opcional e deve ser breve, pois o microfone pode transcrever falas privadas durante o diagnóstico.

1. No Roamies, mantém **Listening → Hands-free → Wake word ON** e o nome **Alec** (uma só palavra).
2. Na pasta extraída do ZIP V2, executa em PowerShell:

```powershell
Unblock-File ".\Diagnosticar-ALEC.ps1"
& ".\Diagnosticar-ALEC.ps1" -Acao Ativar
```

3. Diz em tom normal «Olá Alec» **3 vezes**, com pausas entre tentativas. Não fales sobre informações privadas neste período.
4. Desliga a recolha e apresenta as últimas transcrições:

```powershell
& ".\Diagnosticar-ALEC.ps1" -Acao Recolher
```

5. **Revê o resultado antes de o partilhares**: o texto pode incluir o que foi dito perto do microfone. Se nada for recolhido, confirma se o helper está em modo Wake e consulta `~/Roamies/Data/logs/sidekick-voice.log`.

Para desligar o diagnóstico sem apresentar transcrições:

```powershell
& ".\Diagnosticar-ALEC.ps1" -Acao Desativar
```

O sinalizador usado é `%USERPROFILE%\Roamies\Data\alec-wake-debug.flag`. Não há envio dessas transcrições pelo diagnóstico para a nuvem.

## ALEC V3 — Acordar com duas palmadas rápidas

A partir da revisão V3, o componente nativo reconhece **duas palmadas distintas**, separadas por aproximadamente **0,16 a 0,70 segundos**. O detector analisa a energia, o início abrupto e o conteúdo de altas frequências do áudio no próprio computador. Não depende de uma frequência fixa, de um novo modelo de IA, de internet ou de transcrição de voz.

**A activação por voz continua a funcionar**: «Olá Alec», «Hello Alex» e a saudação definida no painel. A palmada dupla apenas funciona quando **Listening → Hands-free → Wake word** está activo, o microfone está disponível e o assistente não está a responder. Uma sequência detectada abre a escuta hands-free para dizeres o comando **depois** das palmadas.

O instalador V3 activa automaticamente a palmada dupla e cria o marcador local `%USERPROFILE%\Roamies\Data\alec-double-clap.flag`. Podes controlar a opção no PowerShell com o ficheiro `Palmada-Dupla-ALEC.ps1` incluído no ZIP:

```powershell
& ".\Palmada-Dupla-ALEC.ps1" -Acao Estado
& ".\Palmada-Dupla-ALEC.ps1" -Acao Ativar
& ".\Palmada-Dupla-ALEC.ps1" -Acao Desativar
```

**Como testar:** começa num local relativamente silencioso. Faz duas palmadas secas, com ~0,3 segundos de intervalo. Assim que o Roamies mostrar a escuta activa, diz «Que horas são?». Pode ser necessário ajustar a sensibilidade ao microfone real: os testes automáticos utilizam sons sintetizados e não garantem que todas as palmadas sejam reconhecidas. Sons parecidos — como duas batidas fortes ou música — também podem provocar falsos positivos. Se isso ocorrer, desactiva com o comando acima.

A implementação acrescenta apenas processamento acústico leve no helper `roamies-voice.exe`; **não descarrega nem carrega modelos adicionais na RAM**. Todo o código do detector e os seus testes estão em `scripts/clap.rs`, e a integração em `scripts/patch-ola-alec.py`.
