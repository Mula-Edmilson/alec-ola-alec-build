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


## Extensões ALEC — 25/11/2026

A transformação de fontes tem agora 72 âncoras únicas e produz/altera 13 ficheiros, verificadas sobre a referência v0.1.51 com um perfil sintético. A âncora de controlo da mailbox existe exactamente uma vez no bundle V11 privado. O JavaScript do painel transformado foi verificado sintacticamente; a compilação Tauri e a execução Windows continuam pendentes.

### Skill Hub
No painel Abilities > Skill Hub, introduzir a URL HTTPS da raiz de um repositório público GitHub. O motor lê metadados, fixa o SHA do commit, identifica documentos SKILL.md, apresenta o conteúdo e aguarda aprovação explícita (válida durante dez minutos). A importação é exclusivamente documental, usando o motor nativo Roamies. Nenhum script, binário, pacote, dependência ou servidor MCP é instalado por este fluxo. Se o repositório não tiver SKILL.md, indica a necessidade de adaptador; habilidades dependentes de ficheiros auxiliares podem não funcionar. O mecanismo de verificação existente não é garantia de segurança do código. Não confiar em instruções de terceiros que peçam segredos ou execução não autorizada.

Seis testes com dados sintéticos passaram: rejeição de host inválido, conteúdo fixado por SHA e revisão sem instalação, rejeição de aprovação inválida, importação documental aprovada, colisão de nome e expiração. Não foram efectuados testes com repositórios reais através da aplicação Windows.

### Identidade
Perfis Profissional, Técnico e conciso, Criativo e proactivo, persistidos na configuração local; aplicam-se ao personagem ALEC (look jarvis) incluindo o modo conversação. About apresenta website, GitHub, Instagram e autoria do ALEC, preservando os créditos upstream.

### Remote
General > ALEC Remote mostra se o hook está pronto, se a mailbox está sinalizada e permite suspender a aceitação de novos pedidos da mailbox V11. Isto não é um supervisor do processo Bridge, confirmação de conexão do telefone, revogação de sessões, cancelamento de tarefas em andamento nem controlo de ficheiros. O Bridge externo continua a ser necessário. Não alterar a política de acesso do Bridge sem o seu código-fonte real.

### Próximos requisitos de integração
Obter a pasta de código Bridge da versão instalada (servidor, módulos e scripts de arranque/instalação), sem memória, logs, credenciais, códigos de emparelhamento ou dados privados. Integrar arranque/paragem, verificação de saúde, emparelhamento, revogação, permissões por directório e execução de ferramentas remotas. A autorização deve ser aplicada tanto às operações directas do Bridge como às ferramentas do agente: negar por defeito, resolver caminhos e junções NTFS, impedir fugas através de comandos arbitrários, testar travessia, links e revogação. Adaptadores CLI/Python/MCP para repositórios genéricos exigem aprovação, dependências fixadas, isolamento efectivo e testes. Não anunciar nenhuma destas capacidades como disponível antes de integrar e validar.

A branch main e a instalação do utilizador não foram alteradas. Ainda não existe instalador personalizado publicado.
