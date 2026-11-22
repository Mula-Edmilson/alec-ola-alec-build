# ALEC — Modelos Livres V1 | Laboratório isolado Roamies 0.1.50

**Estado: LAB, não é instalador.** Esta implementação só vive no ramo
`lab/modelos-livres-roamies-0150` do repositório `Mula-Edmilson/alec-ola-alec-build`.

## Protecção do ALEC que já funciona

- Ramo `main` e workflow de activação V3/V4/V5: não modificados.
- Roamies instalado em `%LOCALAPPDATA%\Roamies`: não modificado.
- Fish Audio, voz clonada, chave, dados, mensagens, memória: não tocados.
- Nenhum push ao repositório oficial `KenKaiii/Roamies`, nenhum deploy.
- Só são alterados 4 ficheiros JS e adicionados 2 ficheiros de código/testes.
- A fonte upstream é clonada de **tag exacta v0.1.50** num runner descartável; o script
  rejeita fontes alteradas, incompletas ou diferentes (hashes SHA de ficheiro conferidos).
- Não acompanha executável; não instalar por cima do Roamies 0.1.49 personalizado.

## Novas funcionalidades

1. Ollama, LM Studio e servidores locais OpenAI-compatible disponibilizam modelos de chat
   mesmo que não declarem `supportsTools` ou `supportsImages`.
2. Modelos com ambas capacidades continuam no modo completo.
3. Outros modelos recebem automaticamente **modo conversa**: `tools: []`, `maxTurns: 1`,
   prompt muito mais pequeno e sem envio do contexto do ecrã, nem capturas/automação.
4. A lista do painel identifica o modo, e o selector indica
   `Visão + tools` ou `Só conversa`.
5. O histórico textual mantém o mecanismo de sessão/compactação original.
   O prompt curto inclui até 5 factos já guardados, sem acções de escrita na memória.
6. Modelos só conversacionais não podem ser escolhidos para modos de automação/híbrido
   ou subagentes que exigem ferramentas.

## Verificação automática

O workflow `ALEC LAB - Modelos Livres Roamies 0.1.50` executa no Windows:
- verificação exacta do código-fonte v0.1.50 e lista de ficheiros permitidos;
- `node --check` dos módulos editados e do painel;
- `npm ci` e **todos os testes Node** em `showcase/tauri/sidecar`;
- testes novos para modelo com ferramentas/visão, sem ferramentas/visão,
  com visão sem ferramentas e com ferramentas sem visão;
- artefacto `ALEC-Modelos-Livres-Roamies-0150-LAB`, com source overrides e relatório.

## Limites e passos antes de produção

**O LAB não foi compilado como instalador de aplicação Windows.** O teste de
Node é necessário, mas não suficiente: ainda serão necessários um build
Tauri Windows e testes com um servidor Ollama real (modelos com e sem tools),
incluindo voz/Fish Audio, memória, UI e permissões do Windows.

**O repositório não contém o código Roamies inteiro.** Para aplicar este LAB
em desenvolvimento: cria checkout limpo do Roamies v0.1.50 noutra pasta e
corre o script `verificar_e_aplicar.py` com o caminho da cópia e dos overrides.
O script recusa repositórios sujos e versões diferentes.

Não usar o script nem o artefacto na instalação de produção.
