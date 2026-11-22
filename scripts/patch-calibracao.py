#!/usr/bin/env python3
"""Integra o perfil acústico de três pares no helper nativo Roamies v0.1.49.

Executar DEPOIS de scripts/patch-ola-alec.py no GitHub Actions.
Reutiliza o mesmo microfone e a mesma stream WASAPI/cpal do Roamies.
"""
from pathlib import Path
root = Path("upstream/showcase/tauri/src-tauri/voice-win/src")
main = root / "main.rs"
audio = root / "audio.rs"
if not (root / "clap.rs").is_file():
    raise SystemExit("Aplica primeiro scripts/patch-ola-alec.py")
learning = Path("scripts/clap_learning.rs")
if not learning.is_file():
    raise SystemExit("Falta scripts/clap_learning.rs")
a = audio.read_text(encoding="utf-8")
m = main.read_text(encoding="utf-8")

def patch(text, old, new, title):
    if text.count(old) != 1:
        raise RuntimeError(f"{title}: ancora nao unica (encontradas {text.count(old)}) {old[:90]!r}")
    return text.replace(old, new, 1)

m = patch(m, "mod clap;\n", "mod clap;\nmod clap_learning;\n", "main.rs")
a = patch(a,
    "    clap: crate::clap::DoubleClap,\n",
    "    clap: crate::clap::DoubleClap,\n"
    "    calibrated: Option<crate::clap_learning::Matcher>,\n", "audio.rs")
a = patch(a,
    "clap: crate::clap::DoubleClap::default() }",
    "clap: crate::clap::DoubleClap::default(), calibrated: crate::clap_learning::Matcher::load() }",
    "audio.rs")
a = patch(a,
    "        let double_clap = self.clap.feed(&self.out);",
    "        // Depois de calibrar, o perfil aprende com tres amostras e substitui\n"
    "        // a heuristica V3. Se nao houver perfil, mantém a V3.\n"
    "        let double_clap = match self.calibrated.as_mut() {\n"
    "            Some(matcher) => matcher.feed(&self.out),\n"
    "            None => self.clap.feed(&self.out),\n"
    "        };",
    "audio.rs")

calibration_code = r'''
// --clap-calibrate grava apenas temporariamente em RAM.
// Após cada exemplo de duas palmadas, guarda seis características numéricas;
// o som bruto nunca é escrito em disco.
fn alec_calibrate_claps() -> Result<(), String> {
    use std::io::Write;
    let path = clap_learning::default_profile_path()
        .ok_or("Pasta de utilizador não encontrada")?;
    let mut patterns = Vec::with_capacity(3);
    println!("ALEC — CALIBRACAO DE PALMADA DUPLA");
    println!("Grava 3 exemplos no microfone predefinido do Windows.");
    println!("O áudio permanece em memória e é descartado após a análise.");
    println!("Faz cada dupla de palmadas com o ritmo que te seja confortável.");
    println!("Fecha o Roamies antes desta calibração para libertar o microfone.");
    for i in 0..3 {
        let mut tries = 0;
        loop {
            tries += 1;
            if tries > 6 {
                return Err(format!("Exemplo {} não foi captado após 6 tentativas; verifica microfone, ruído e distância.", i + 1));
            }
            println!();
            print!("EXEMPLO {}/3 (tentativa {}): carrega ENTER para começar a captar...", i + 1, tries);
            std::io::stdout().flush().map_err(|e| e.to_string())?;
            let mut answer = String::new();
            std::io::stdin().read_line(&mut answer).map_err(|e| e.to_string())?;
            let (tx, _rx) = mpsc::channel::<Ev>();
            let samples = Arc::new(Mutex::new(Vec::<f32>::new()));
            let sink = audio::Sink::new(samples.clone(), tx);
            let source = audio::open_mic(sink).map_err(|e| e.detail)?;
            println!("AGORA: faz DUAS PALMADAS rápidas (palm-palm)!");
            std::thread::sleep(Duration::from_millis(2700));
            drop(source);
            let captured = std::mem::take(&mut *samples.lock().map_err(|e| e.to_string())?);
            match clap_learning::extract(&captured) {
                Some(pattern) => {
                    println!("OK: exemplo {} captado, intervalo de {:.0} ms.", i + 1, pattern.gap_ms);
                    patterns.push(pattern);
                    break;
                }
                None => {
                    println!("Nao detectei exactamente um par de palmadas. Tenta novamente.");
                    println!("Dica: palma as mãos a 20-60 cm do microfone, com pausas entre estalos.");
                }
            }
        }
    }
    let profile = clap_learning::Profile::new([patterns[0], patterns[1], patterns[2]])?;
    profile.save(&path)?;
    println!();
    println!("PERFIL CALIBRADO! Foram guardados três exemplos numéricos em:");
    println!("{}", path.display());
    println!("Não foram guardadas gravações de áudio.");
    println!("Abre o Roamies e experimenta duas palmadas (Wake word deve estar ON).");
    Ok(())
}

'''
m = patch(m, "fn main() {\n", calibration_code + "fn main() {\n", "main.rs")
m = patch(m,
    '    if args.iter().any(|a| a == "--perms") {\n',
    '    if args.iter().any(|a| a == "--clap-calibrate") {\n'
    '        if let Err(e) = alec_calibrate_claps() {\n'
    '            eprintln!("CALIBRACAO FALHOU: {e}");\n'
    '            std::process::exit(1);\n'
    '        }\n'
    '        return;\n'
    '    }\n'
    '    if args.iter().any(|a| a == "--perms") {\n', "main.rs")

main.write_text(m, encoding="utf-8", newline="\n")
audio.write_text(a, encoding="utf-8", newline="\n")
(root / "clap_learning.rs").write_text(learning.read_text(encoding="utf-8"), encoding="utf-8", newline="\n")
print("ALEC V4: treino local de 3 exemplos, perfil e matcher integrados.")
