# ALEC Desktop — proposta de integração e distribuição

Estado: protótipo visual independente, não integrado no runtime. Base de referência confirmada: Roamies v0.1.51, Tauri 2 (showcase/tauri/src-tauri/tauri.conf.json). Esta branch deriva de alec-universal-providers; não substitui main.

## Experimentar a interface
Abrir desktop-redesign/index.html num navegador moderno. Não precisa de instalação, rede, credenciais ou dependências. A esfera e os quatro estados são animados; a navegação e o histórico de demonstração funcionam localmente. As ligações e respostas são simuladas. Nenhuma informação é persistida ou enviada.

## Arquitectura proposta
- Interface principal ALEC: painel compacto, histórico, provedores, controlo remoto e preferências; avatar flutuante independente, original, com estados de voz vindos do runtime (não inferidos por temporizadores).
- Adaptador frontend: mapear eventos e comandos Tauri existentes, sem introduzir acesso genérico a shell nem alterar as confirmações de ferramentas. Inventariar contratos no código upstream antes de implementar.
- Motor IA: manter sidecar, descoberta de modelos, chaves, ferramentas, visão e limites; aplicar patch de provedores apenas nas âncoras validadas.
- Voz: manter helper ALEC V5, Fish Audio e modelo Hello Alex; compilar contra a versão de referência e testar compatibilidade. Reutilizar a esfera JARVIS nativa como referência técnica de estados, sem depender da identidade visual de terceiros.
- Bridge: preservar os comandos, portas, escuta e áudio PCM da versão instalada; comparar o sidekick.mjs real e o script Instalar-Integracao-Roamies.ps1. Não copiar credenciais nem ficheiros pessoais para GitHub.

## Instalador Windows x64
1. Fixar código upstream por commit/tag e guardar patches reproduzíveis; preservar avisos, licença AGPL e disponibilizar código correspondente ao binário, verificar licenças de modelos e recursos.
2. Usar um identificador Tauri próprio, nome ALEC e ícones próprios; manter a versão Roamies existente intacta durante testes. Não apontar o updater do fork para releases upstream: desactivar actualizações automáticas até existir feed próprio assinado.
3. Compilar frontend, sidecar e binários nativos com as ferramentas e dependências do workflow upstream; gerar instalador Tauri/NSIS em runner Windows. Ainda não existe workflow validado para este fork.
4. Implementar migrador local explícito: inventário de versão e hashes, cópia de segurança, migração de dados sem impressão ou upload de segredos, abortar em incompatibilidade. Validar DPAPI/identidade e autenticação sem exportar credenciais em texto simples. Coordenar portas e instâncias com o Bridge; não executar simultaneamente se conflituarem.
5. Testar arranque/fecho, atalhos, janela flutuante, voz personalizada, wake word, Bridge bidireccional, ferramentas com confirmação, memória, fornecedores e recuperação. Testar em Windows 11/10 conforme suporte upstream, incluindo a máquina real do utilizador.
6. Após aprovação dos testes, publicar release GitHub com instalador, SHA-256, notas, código correspondente e instruções de rollback. Assinatura de código Windows requer certificado próprio; não confundir com assinatura do updater. Não anunciar release enquanto não houver artefacto real.

## Bloqueadores actuais
- Obter sidekick.mjs instalado e script de integração Bridge actual, sem segredos.
- Confirmar dependências e comandos upstream de compilação; ainda não foi compilado o novo aplicativo.
- Validar visual, eventos e migração no Windows real. Nenhum teste de runtime foi realizado neste protótipo.

Referências: https://github.com/KenKaiii/Roamies/tree/v0.1.51 e https://github.com/KenKaiii/Roamies/blob/v0.1.51/showcase/tauri/src-tauri/tauri.conf.json .
