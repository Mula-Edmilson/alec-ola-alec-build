# ALEC Desktop nativo — migração 0.1.51 (candidato)
 
Esta pasta contém uma transformação **dos ficheiros-fonte reais do Roamies**, não apenas o protótipo HTML. Não substitui a instalação actual. Base: https://github.com/KenKaiii/Roamies/tree/v0.1.51

## Trabalho feito
- Verificação do bundle fornecido com Node 22 e SHA-256 `4bd3e971b6ad039475ff52f23db5a7ded801a12c61189ab18ec96c303ddddfab`.
- Confirmada a presença do hook ALEC Remote V11, de voz personalizada e modelo Fish gratuito, do nome personalizado e do modo conversa para modelos sem visão/ferramentas.
- `preparar-fonte.mjs` transforma uma cópia limpa do upstream v0.1.51, valida cada âncora exactamente uma vez e verifica sintaxe dos JavaScript alterados antes de escrever. Extrai o hook e as personalizações localmente do bundle auditado, sem publicar o bundle, nome, referência de voz nem chaves.
- Migração dos callbacks PCM/voz, fila de comandos, eventos de telemetria, modo conversa sem ferramentas, nome e voz.
- Novo tema nativo: Midnight/Energy, tipografia Segoe UI, painel e esfera com paleta unificada, orb baseado no renderer já ligado aos estados do agente e áudio. Mantém a estrutura das páginas e controlos nativos, e a escolha de personagens. A esfera ALEC é o padrão para configurações novas; a escolha já guardada não é modificada automaticamente.
- Descoberta OpenAI-compatible com timeout maior; catálogo específico da Cloudflare e chamadas reais a fornecedores ainda por validar.
- Identificador de aplicação distinto e bloqueio do updater original no comando nativo; não activar actualizações upstream.

## Validação realizada
- As 59 âncoras de alteração foram verificadas contra os ficheiros oficiais v0.1.51 obtidos do GitHub, com perfil fictício; 12 ficheiros produzidos/modificados.
- O bundle pessoal passou `node --check` com Node 22.16.0. A extracção dos campos de migração foi validada sobre esse bundle sem imprimir os seus valores.
- Teste isolado do hook V11, numa HOME temporária, com PCM e comandos sintéticos: áudio PC intacto, áudio remoto silenciado no PC, envio exclusivo para o dispositivo autorizado, mailbox desactivada por defeito, exclusão de replay, expiração e telemetria. Não houve chamadas de rede nem execução do agente completo.
- Ainda não foi executado `preparar-fonte.mjs` com o checkout completo nem a compilação Tauri/NSIS em Windows. Os resultados de testes isolados não constituem regressão end-to-end.

## Preparar código local (opcional para desenvolvimento; não é instalação)
Node >=22 e Git necessários. Clonar a tag para uma pasta descartável que não contenha o bundle privado. A partir da pasta native:
```powershell
git clone --branch v0.1.51 --depth 1 https://github.com/KenKaiii/Roamies.git ALEC-source-0151
node .\preparar-fonte.mjs .\ALEC-source-0151 "$env:LOCALAPPDATA\Roamies\sidecar\sidekick.mjs"
```
Se a versão ou o hash diferirem, a operação aborta. **Não fazer push do checkout preparado**, porque contém a referência de voz/nome privado. Nenhum ficheiro do Roamies instalado é editado. Não colocar credenciais, memórias, configurações privadas ou o bundle pessoal no repositório.

## Pendências antes de uma release pública
- Separar os valores privados do perfil numa migração local de instalação, para permitir compilação no GitHub sem publicar dados pessoais.
- Confirmar versão/compatibilidade do helper Hello Alex/openWakeWord e recuperar a integração Bridge completa. O hook foi recuperado, mas não substitui o Bridge externo.
- Testar o catálogo Cloudflare, os fornecedores com chaves reais, a UI e as regressões de voz, áudio, controlos nativos, visão, ferramentas, memória e DPAPI.
- Testar o instalador isolado; o nome do binário interno, os dados ~/Roamies e as credenciais ~/.gg são partilhados com a instalação original. Não iniciar ambas as instâncias simultaneamente; confirmar o mecanismo de arranque e migração.
- Preservar AGPL-3.0, disponibilizar código-fonte correspondente ao instalador e verificar licenças dos recursos. Só publicar instalador depois dos testes.
 
**Não existe ainda uma release executável ALEC 0.1.51 aprovada.**
