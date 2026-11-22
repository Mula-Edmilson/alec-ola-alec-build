#!/usr/bin/env python3
"""ALEC: patch isolado de wake.rs / main.rs da release v0.1.49.

Não toca em sidekick.mjs, Fish Audio ou configuração do utilizador.
O diagnóstico das transcrições só funciona após criar explicitamente
~/Roamies/Data/alec-wake-debug.flag.
"""
from pathlib import Path

root = Path("upstream/showcase/tauri/src-tauri/voice-win/src")
wake = root / "wake.rs"
main = root / "main.rs"
if not wake.is_file() or not main.is_file():
    raise SystemExit("Codigo original v0.1.49 nao localizado.")

w = wake.read_text(encoding="utf-8")
m = main.read_text(encoding="utf-8")

def once(s: str, old: str, new: str, location: str) -> str:
    if s.count(old) != 1:
        raise RuntimeError(f"{location}: esperava 1 ponto de aplicacao, encontrei {s.count(old)}: {old[:72]!r}")
    return s.replace(old, new, 1)

helper = r'''
// ALEC_PT_WAKE_V2. Esta regra e adicional: nao elimina Hey Jarvis / Hey Alec.
// Inclui variantes comuns produzidas por um transcritor multilingue.
fn alec_pt_wake(text: &str, words: &[Token]) -> Option<String> {
    const GREET: &[&str] = &[
        "olá", "ola", "olha", "hola", "hello", "alô", "alo",
        "hey", "hi", "hay", "heya", "hiya"
    ];
    const NAME: &[&str] = &[
        "alec", "alek", "aleck", "alex", "alexe", "aleque",
        "aléque", "aleke", "alick", "alic"
    ];
    for i in 0..words.len().saturating_sub(1) {
        if !GREET.contains(&words[i].word.as_str()) { continue; }
        let before = &text[if i == 0 { 0 } else { words[i - 1].end }..words[i].start];
        let at_start = i == 0 || before.contains(['.', '?', '!']) ||
            (i <= 2 && words[..i].iter().all(|w|
                matches!(w.word.as_str(), "hum" | "hm" | "ah" | "um" | "eh")));
        if !at_start { continue; }
        let between = &text[words[i].end..words[i + 1].start];
        if !between.chars().all(|c| c == ' ' || c == ',' || c == '\t') { continue; }

        let mut end = None;
        if NAME.contains(&words[i + 1].word.as_str()) {
            end = Some(words[i + 1].end);
        } else if i + 2 < words.len() {
            let joined = words[i + 1].word.clone() + &words[i + 2].word;
            let split = &text[words[i + 1].end..words[i + 2].start];
            if split.chars().all(char::is_whitespace) && NAME.contains(&joined.as_str()) {
                end = Some(words[i + 2].end);
            }
        }
        if let Some(end) = end {
            let rest = text[end..].trim_start_matches(|c: char| !c.is_alphanumeric());
            return Some(rest.trim().to_string());
        }
    }
    None
}

'''
tests = r'''
    #[test]
    fn alec_pt_variantes_multilingues() {
        let mut w = WakeWord::default();
        for text in [
            "Olá Alec", "Ola Alec", "Olha Alex", "Hola Alec",
            "Hello Alec", "Olá Aleque", "Alô, Alex", "Hey Alex", "Olá A lec"
        ] {
            assert_eq!(w.match_rest(text), Some(String::new()), "{text:?}");
        }
        assert_eq!(w.match_rest("Olá Alec, que horas são?").as_deref(), Some("que horas são?"));
        assert_eq!(w.match_rest("Hello Alex, open Chrome").as_deref(), Some("open Chrome"));
        for text in ["Eu disse olá Alec ontem", "Olá Alice", "Olá Bernardo", "Olá Google", "Hello there"] {
            assert_eq!(w.match_rest(text), None, "{text:?}");
        }
        assert!(w.set_name(Some("Jarvis")));
        assert_eq!(w.match_rest("Olá Alec, bom dia").as_deref(), Some("bom dia"));
        assert_eq!(w.match_rest("Hey Jarvis"), Some(String::new()));
    }

'''
w = once(w, "impl WakeWord {", helper + "impl WakeWord {", "wake.rs")
anchor = "    pub fn scan(&self, text: &str) -> Scan {\n        let words = tokens(text);\n"
w = once(
    w, anchor,
    anchor + "        if let Some(rest) = alec_pt_wake(text, &words) {\n"
             "            return Scan { rest: Some(rest), distance: Some(0) };\n"
             "        }\n",
    "wake.rs"
)
w = once(w, "    #[test]\n    fn a_name_of_the_users_own() {",
         tests + "    #[test]\n    fn a_name_of_the_users_own() {", "wake.rs")

# Diagnóstico local opt-in: nenhum texto vai para a nuvem, nem se escreve
# transcrição no log a menos que o utilizador crie o ficheiro indicador.
diagnostic = r'''
// ALEC_WAKE_DEBUG_V2: logs de voz apenas com consentimento local explícito.
// O sinalizador pode ser ligado/desligado enquanto o Roamies está aberto.
fn alec_wake_debug_enabled() -> bool {
    std::env::var_os("USERPROFILE")
        .is_some_and(|home|
            PathBuf::from(home).join("Roamies").join("Data")
                .join("alec-wake-debug.flag").is_file())
}

'''
m = once(m, "pub enum Ev {", diagnostic + "pub enum Ev {", "main.rs")
anchor2 = "        self.wake_reading = false;\n        let scan = self.wake.scan(&text);\n"
m = once(
    m, anchor2,
    "        self.wake_reading = false;\n"
    "        if alec_wake_debug_enabled() {\n"
    "            let excerpt: String = text.chars().take(160).collect();\n"
    "            log(&format!(\"ALEC_WAKE_DEBUG transcricao: {:?}\", excerpt));\n"
    "        }\n"
    "        let scan = self.wake.scan(&text);\n",
    "main.rs"
)

wake.write_text(w, encoding="utf-8", newline="\n")
main.write_text(m, encoding="utf-8", newline="\n")
print("Patch V2 aplicado: variantes de fala e diagnostico opt-in.")
