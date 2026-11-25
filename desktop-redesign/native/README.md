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


## Bridge V16 gerido pelo ALEC Desktop

### Base recuperada
O ZIP V16 fornecido contém o Bridge Python, recursos web, scripts de captura e leitura de chaves DPAPI, integração V11 e código Android. O hook V11 do ZIP coincide com o prefixo do sidekick privado auditado; este último passou novamente node --check. O script pessoal contém 18 directórios literais: o importador foi testado sobre esse script local sem imprimir ou publicar os caminhos. O APK e protocolo V16 não foram alterados.

### Integração de fontes
- `alec-bridge-supervisor.mjs` verifica SHA-256 de 36 ficheiros do Bridge V16 e copia exclusivamente esses recursos para uma pasta temporária; executa Python 3.10+ como processo filho, sem shell e sem elevação. Não copia o script de pastas pessoais, dados, credenciais, sessões, modelos, logs nem o APK.
- O servidor usa a interface IPv4 privada escolhida, porta 8765. Só apresenta o código de emparelhamento depois de o servidor confirmar a abertura da porta e configuração. O código não é guardado em configuração nem escrito em logs pelo supervisor. Parar/reiniciar o servidor termina as suas sessões; o fecho do pipe do processo pai solicita o encerramento do filho.
- No painel General > Bridge V16: configurar pasta do projecto (detectada se empacotada), executável Python (detectado para alguns caminhos do launcher), interface privada, leitura de pastas, pasta de recepção, Ask, ecrã, webcam, parâmetros de visão e arranque automático. Guardar, Iniciar e Parar não requerem comandos PowerShell manuais. A primeira configuração exige Python funcional e selecção/validação da interface. Não instala Python nem OpenCV e não abre firewall automaticamente.
- Importação local das pastas do script pessoal V16: lê apenas a lista literal, não executa o script; mostra as pastas para revisão e só aplica depois de adicionar à lista e guardar. As pastas conhecidas implícitas em -Ficheiros e o destino de recepção são configurados separadamente. Nenhum caminho pessoal foi publicado.
- A API directa do Bridge continua a usar as verificações V16 para leitura, pesquisa, download e recepção de ficheiros sem sobrescrever. Pastas e permissões novas são aplicadas no próximo arranque do Bridge. Ask remoto com ferramentas gerais está desligado por defeito na configuração gerida. Se activado explicitamente, **não é limitado pelas pastas da API de ficheiros**; um sandbox integral de ferramentas do agente continua pendente. Parar o serviço não cancela tarefas que o agente já recebeu. O serviço gerido não adopta nem termina um Bridge externo iniciado por outro processo; um conflito na porta impede o arranque.
- A transformação opcional inclui o Bridge no mapa de recursos Tauri. O modo de empacotamento é local e depende do ZIP fornecido; não foi publicada a cópia pessoal nem criada uma release. O instalador ainda não inclui um runtime Python próprio.

### Preparar a build com os recursos do Bridge
O comando de preparação para desenvolvimento (em checkout descartável) passa a aceitar a pasta V16 extraída como terceiro argumento:
```powershell
node .\preparar-fonte.mjs .\ALEC-source-0151 "$env:LOCALAPPDATA\Roamies\sidecar\sidekick.mjs" "C:\caminho\ALEC_Remote_V16"
```
O script valida o bundle privado e as âncoras de transformação. A preparação inclui os recursos auditados, mas não compila nem instala a aplicação. Não publicar o checkout personalizado com valores privados.

### Testes executados
- 101 testes Python originais V16 passaram no ambiente Linux.
- 4 testes adicionais sobre um runner local equivalente ao processo gerido passaram (servidor/HTTP, emparelhamento e pastas, encerramento por stdin, rejeição de pasta inexistente, endereço público/wildcard e conflito de porta). Total: 105 testes Python. O supervisor Node e o runner incorporado ainda precisam de ser testados juntos no Windows real.
- Testes JavaScript originais do ZIP passaram: hook V11, 20 casos de routing de ficheiros, interface, ownership de áudio nativo e 14 casos de routing de visão.
- 4 testes sintéticos do parser de pastas passaram e 18 entradas foram extraídas do script real sem executar PowerShell.
- 80 âncoras contra fontes oficiais v0.1.51 (com perfil sintético e fixture da âncora do hook) e 14 ficheiros transformados/gerados; sintaxe do painel transformado e do supervisor verificada em JavaScript. Mapa Tauri de recursos validado. Ainda não foi efectuada build ou execução end-to-end no Windows.

### Pendências
Compilar Tauri/NSIS, validar ligação com APK Android V16, Python/DPAPI/webcam, compatibilidade do helper Hello Alex, isolamento integral das ferramentas Ask, migração privada de dados/voz separada de uma release pública, adaptadores executáveis de Skill Hub e catálogo Cloudflare. Validar também arranque automático, paragem e reinício no Windows e resolução de conflitos com Roamies antigo.

A versão estável e a instalação actual não foram modificadas. Não há instalador ALEC personalizado validado publicado.
