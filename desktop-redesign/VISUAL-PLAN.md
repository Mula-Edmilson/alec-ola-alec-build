# ALEC Desktop — identidade visual unificada

Referência: ALEC Remote V9 (esfera de partículas inspirada no movimento LANDR, legenda de estado, dois controlos essenciais e feedback textual). A reprodução exacta do recurso gráfico original ainda depende da recuperação do código/ficheiro de referência da versão instalada.

## Ecrã principal
- Fundo azul-noite #070A12; painéis #101622; texto #EAF2FF; acento azul-lavanda #A6BAFF. Paleta proposta, não extraída da imagem original.
- Esfera animada própria, com partículas tridimensionais projectadas em Canvas 2D; navegação lateral compacta, dois controlos principais (Escutar e Escrever), feedback textual abaixo da esfera.
- Histórico, visão, Bridge/controlo remoto, provedores e definições em painéis separados. As confirmações de segurança e permissões nativas devem permanecer disponíveis.
- Modo compacto flutuante: esfera, estado e dois controlos; integração real com a janela nativa pendente.

## Estados
Disponível: respiração lenta. Escuta: expansão. Processamento: rotação acelerada. Execução: movimento activo e feedback por evento. Resposta: pulsação com amplitude real do áudio existente, não temporizador. Conclusão: transição suave para repouso. Erro: indicação visual e textual.
No protótipo, todos os estados são simulados; não usa áudio real nem IA.

## Implementação
1. Reutilizar o componente real do Remote se recuperado e compatível; manter alternativa Canvas original e reduzida para hardware modesto. Respeitar redução de movimento.
2. Mapear eventos e comandos reais do frontend Roamies; manter motor de IA, ferramentas, memória, voz Fish Audio, Hello Alex, Bridge PCM e API Keys sem os expor.
3. Testar os contratos e todos os recursos existentes, com migração local reversível; nenhuma remoção de funcionalidade sem aprovação.
4. Compilar e testar instalador separado no Windows; só publicar uma release após regressão funcional, preservação de dados e verificação de licença.

## Demonstração
Abrir remote-inspired.html localmente num navegador moderno. O protótipo está separado do primeiro index.html e não altera a aplicação instalada. Não existe ainda binário integrado. 
