# ALEC V5 — Activação neural «Hello Alex»

Este repositório compila um componente `roamies-voice.exe` personalizado para **Roamies 0.1.49 (Windows x64)**. A partir da V5, a activação recomendada é feita por um modelo neural **openWakeWord**, não por uma heurística de sons. O modelo **não é treinado durante a compilação** do executável.

A voz clonada Fish Audio, a memória, o website e os restantes projectos não são alterados.

## 1 — Treinar «Hello Alex» no Google Colab

[**Abrir o notebook ALEC pré-configurado no Colab**](https://colab.research.google.com/github/Mula-Edmilson/alec-ola-alec-build/blob/main/notebooks/ALEC_Hello_Alex_Colab.ipynb)

O notebook foi adaptado do [openwakeword-colab-toolkit](https://github.com/saintpete/openwakeword-colab-toolkit) (Unlicense), que inclui adaptações conhecidas para Colab 2026. Treina **hello alex** e **hello alec** como duas variações do mesmo gatilho.

No Colab, selecciona **Runtime → Change runtime type → T4 GPU** quando disponível. Depois **Runtime → Run all**. No fim descarrega `hello_alex_outputs.zip`, que contém `hello_alex.onnx` autocontido. O treino pode consumir quota de GPU; a versão gratuita do Colab não garante disponibilidade de recursos. As dependências e os dados de treino são descarregados no Colab, não no teu Windows.

**O ChatGPT não tem acesso automático à tua sessão Google Colab.** Esta etapa tem de ser iniciada na tua conta. Não carregues gravações pessoais no repositório público do GitHub.

## 2 — Compilar e instalar o helper V5

O GitHub Actions compila o motor nativo com o detector openWakeWord em Rust (oww-rs + tract-onnx). O motor neural **só carrega se existir um modelo no PC**; caso contrário, o Roamies mantém o detector de frase tradicional.

[**Consultar compilações GitHub Actions**](https://github.com/Mula-Edmilson/alec-ola-alec-build/actions)

Descarrega o artefacto `ALEC-V5-Hello-Alex-Windows` **apenas depois de uma execução verde**. Extrai e, na pasta do ZIP, executa no PowerShell:

```powershell
Unblock-File ".\Instalar-ALEC-Compilado.ps1"
& ".\Instalar-ALEC-Compilado.ps1"
```

O instalador compara a versão do Roamies, verifica SHA-256, cria um backup do helper original e **desactiva as palmadas por defeito** para não acordar com ruídos. O modelo `Hello Alex` é instalado separadamente.

## 3 — Instalar o modelo treinado

Com o Roamies fechado, e a partir da pasta do pacote V5:

```powershell
Unblock-File ".\Instalar-Modelo-Hello-Alex.ps1"
& ".\Instalar-Modelo-Hello-Alex.ps1" -Zip "C:\CAMINHO\hello_alex_outputs.zip"
```

Substitui o caminho pelo do ficheiro realmente descarregado do Colab. O instalador copia `hello_alex.onnx` para `%USERPROFILE%\Roamies\Data\hello_alex.onnx` e testa a inferência no helper. Se o modelo for incompatível, **repõe o modelo anterior** ou apaga a cópia nova. O modelo **nunca é enviado para o repositório público**.

Depois, reabre o Roamies, activa **Listening → Hands-free → Wake word**, e diz «Hello Alex». Aguarda a indicação de escuta e dita o comando.

## 4 — Prevenir falsos despertares

Não prometemos precisão infalível: a detecção depende de volume, sotaque, microfone, televisão, ruído e do treino. Recomendamos validar um modelo com gravações reais positivas e pelo menos uma hora de áudio ambiente negativo, sem a wake word, medindo falsos positivos por hora e taxa de acerto. O toolkit 2026 inclui um avaliador para isso.

Se quiseres confirmar que a antiga activação por palmadas está desligada:

```powershell
Remove-Item "$env:USERPROFILE\Roamies\Data\alec-double-clap.flag" -Force -ErrorAction SilentlyContinue
```

Para remover o modelo e voltar à activação textual original, fecha o Roamies e executa:

```powershell
Remove-Item "$env:USERPROFILE\Roamies\Data\hello_alex.onnx" -Force -ErrorAction SilentlyContinue
```

Depois reinicia o Roamies. Para restaurar o helper original, utiliza `Restaurar-ALEC.ps1`.

### Notas técnicas e licenças

- Código-base Roamies: AGPL-3.0-only.
- openWakeWord: código Apache-2.0; **modelos pré-treinados disponibilizados pelo projecto podem ter restrições não comerciais**. Verifica as licenças de dados/modelos antes de distribuição comercial.
- oww-rs: MIT; o motor tract utiliza modelos de pré-processamento incorporados.
- O motor V5 usa o **mesmo fluxo de áudio** do helper Rust e processa inferência numa thread separada. Não instala um servidor Python ou um segundo LLM.
- O consumo real de memória e CPU no teu computador ainda precisa de ser medido; a compilação no GitHub não demonstra desempenho real em Windows com 8 GB RAM.
