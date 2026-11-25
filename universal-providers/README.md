# ALEC Universal Providers — candidato incremental para Windows

**Estado:** patch de compatibilidade para o bundle instalado, não um novo Roamies compilado. O bundle arquivado da versão 0.1.49 contém as duas âncoras necessárias; o patch exige correspondências únicas e valida a sintaxe antes de substituir o ficheiro. O Roamies 0.1.51 é a versão oficial de referência, mas a migração das personalizações ainda não foi validada.

## O que muda

- Prolonga de 1,5 s para 12 s o tempo de descoberta em servidores personalizados HTTPS; Ollama e LM Studio mantêm o comportamento anterior.
- Opcionalmente, para a URL exacta do Workers AI, consulta o catálogo autenticado da Cloudflare e aceita exclusivamente os IDs @cf seleccionados na instalação. Não inventa modelos, não ignora erros de autenticação.
- Mantém o protocolo OpenAI-compatible nativo do Roamies e a gestão original das chaves e dos backups de modelos. Não instala novos modelos locais, não inicia outro servidor.
- Não modifica o executável, o helper de voz, a memória, as credenciais, o Bridge ou outros ficheiros. A edição é limitada a duas âncoras no sidekick; a integração real do Bridge após a edição ainda exige teste em Windows.
- Não habilita fallback ou modelos pagos automaticamente. Quotas e faturação são controladas pelo provedor; usar apenas modelos autorizados na conta. Não existe garantia de custo zero.

## Verificação inicial (sem alterações)
Extrair o ZIP, abrir PowerShell na pasta universal-providers, e correr:
```powershell
Unblock-File .\Instalar-ALEC-Provedores.ps1
& .\Instalar-ALEC-Provedores.ps1 -Acao Estado
```
Node.js 22+ é necessário. A verificação mostra SHA-256 e presença do suporte nativo, sem mostrar chaves.

## Instalar o patch incremental (candidato, não validado no PC)
Fechar Roamies completamente, incluindo a bandeja, e parar temporariamente o ALEC Bridge. O instalador valida as âncoras, cria backup e manifesto SHA-256, valida com node --check e só então substitui o sidekick. Se a versão ou as âncoras não coincidirem, aborta. Para experimentar o catálogo Cloudflare, indicar apenas modelos que se confirmou suportarem as capacidades e quota pretendidas:
```powershell
& .\Instalar-ALEC-Provedores.ps1 -Acao Instalar
# OU, com um modelo explicitamente escolhido e confirmado:
& .\Instalar-ALEC-Provedores.ps1 -Acao Instalar -ModelosCloudflare '@cf/openai/gpt-oss-120b'
```
A segunda opção é um exemplo de ID e não prova suporte a visão, ferramentas, nem gratuitidade. O catálogo seleccionado só se aplica à Cloudflare; não muda os outros provedores. Para alterar a lista, restaurar primeiro o patch e reinstalar.

## Adicionar APIs pela interface nativa
No Roamies abrir Settings / Connections, procurar Local models / Add a server (o nome exacto pode variar pela versão), e introduzir nome, Base URL e chave. Nunca enviar a chave ao GitHub.

| Nome | Base URL | Chaves |
|---|---|---|
| NVIDIA NIM | https://integrate.api.nvidia.com/v1 | https://build.nvidia.com/ |
| SambaNova | https://api.sambanova.ai/v1 | https://cloud.sambanova.ai/ |
| Cloudflare Workers AI | https://api.cloudflare.com/client/v4/accounts/ACCOUNT_ID/ai/v1 | https://dash.cloudflare.com/ |
| Cerebras | https://api.cerebras.ai/v1 | https://cloud.cerebras.ai/ |
| Groq | https://api.groq.com/openai/v1 | https://console.groq.com/keys |
| Outro OpenAI-compatible | URL HTTPS indicada pelo provedor | portal do provedor |

Substituir ACCOUNT_ID pelo ID da conta Cloudflare. A descoberta Cloudflare requer token com Workers AI Read/Write, conforme documentação. O Roamies original exige modelos com visão e ferramentas para o agente principal; modelos apenas de texto podem aparecer como subagentes. Não activar a opção "Its models can see images" para modelos sem visão. O catálogo Cloudflare não demonstra as capacidades dos modelos. Testar cada modelo, incluindo uma chamada de ferramentas e visão quando aplicável. Configurar Backups/Fallbacks na aplicação apenas com modelos expressamente autorizados; o patch não altera esses valores.

## Recuperação
Fechar Roamies. Usar o manifesto apresentado na instalação:
```powershell
& .\Instalar-ALEC-Provedores.ps1 -Acao Restaurar -Manifesto 'C:\CAMINHO\sidekick.mjs.alec-manifest-....json'
```
A restauração verifica o hash actual e o backup; se houver outro patch posterior, recusa substituir o ficheiro. Cria um backup adicional da versão restaurada.

## Preparar 0.1.51 (sem instalar)
```powershell
Unblock-File .\Preparar-Roamies-Atualizacao.ps1
& .\Preparar-Roamies-Atualizacao.ps1
```
Descarrega apenas o instalador oficial fixado na tag v0.1.51 e verifica o SHA-256 publicado pela API GitHub, abortando se indisponível. Não executa o instalador. Não instalar por cima da versão personalizada sem primeiro reconstruir e testar as alterações de voz, integração Bridge e wake word para 0.1.51.

## Validação pendente
- Teste do launcher Windows e restauração no PC real.
- Chaves reais, descoberta Cloudflare, streaming, tool calling e fallback.
- Regressão da voz personalizada, Hello Alex, controlo remoto e áudio PCM.
- Compilação e teste da distribuição 0.1.51 personalizada; não existe um .exe personalizado aprovado nesta branch.

Fontes: https://github.com/KenKaiii/Roamies/releases/tag/v0.1.51 ; https://developers.cloudflare.com/workers-ai/configuration/open-ai-compatibility/ ; https://developers.cloudflare.com/api/resources/ai/subresources/models/methods/list/ . O Roamies é AGPL-3.0-only; preservar licença e disponibilizar código correspondente de qualquer distribuição modificada.
