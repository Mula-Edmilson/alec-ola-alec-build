// ALEC Conversation Engine: deterministic endpoint policy, no extra model.
// Times use monotonic seconds. Deliberately more patient for short/uncertain phrases.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Profile { Adaptive, Patient }
impl Profile {
    pub fn parse(s: &str) -> Self { if s == "patient" { Self::Patient } else { Self::Adaptive } }
    pub fn pause(self, words: usize) -> f64 {
        match self { Self::Patient => 1.5, Self::Adaptive if words >= 4 => 0.7,
            Self::Adaptive if words > 0 => 1.05, Self::Adaptive => 1.45 }
    }
    pub fn read_every(self) -> f64 { match self { Self::Adaptive => 1.2, Self::Patient => 0.8 } }
    pub fn end(self, words: usize, quiet: f64, speech: bool, wake_only: bool) -> bool {
        speech && !wake_only && quiet.is_finite() && quiet >= self.pause(words)
    }
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test] fn normal_speech_ends_quickly_but_not_midword() {
        let p=Profile::Adaptive;
        assert!(!p.end(6,0.69,true,false)); assert!(p.end(6,0.7,true,false));
        assert!(!p.end(1,0.9,true,false)); assert!(p.end(1,1.05,true,false));
        assert!(!p.end(0,1.3,true,false)); assert!(p.end(0,1.45,true,false));
    }
    #[test] fn silence_and_wake_only_do_not_dispatch() {
        let p=Profile::Adaptive;
        assert!(!p.end(0,8.0,false,false));assert!(!p.end(0,8.0,true,true));
        assert!(!p.end(4,f64::NAN,true,false));assert!(!p.end(4,-1.0,true,false));
    }
    #[test] fn patient_profile_preserves_longer_pauses() {
        assert!(!Profile::Patient.end(10,1.49,true,false));assert!(Profile::Patient.end(10,1.5,true,false));
        assert_eq!(Profile::parse("invalid"),Profile::Adaptive);
        assert!(Profile::Adaptive.read_every()>Profile::Patient.read_every());
    }
}
