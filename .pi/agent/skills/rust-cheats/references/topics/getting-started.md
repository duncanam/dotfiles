# Syntax: setup, first steps, strengths and limitations

From [cheats.rs](https://github.com/ralfbiedert/cheats.rs/blob/f153e8e1da51e909fb6e1ed210013c6aadab80c2/content/_index.md); archive lines 16–74.
Read with the [shared caveats](../common.md). [Provenance](../../provenance.json) · [Terms](../../NOTICE.md).

---

## Hello, Rust!

If you are new to Rust, or if you want to try the things below:

### Hello World

```rust
fn main() {
    println!("Hello, world!");
}
```


### Strengths

**Things Rust does measurably really well**

- Compiled code [about same performance](https://benchmarksgame-team.pages.debian.net/benchmarksgame/box-plot-summary-charts.html) as C / C++, and excellent memory and energy efficiency.
- Can [avoid 70% of all safety issues](https://www.chromium.org/Home/chromium-security/memory-safety) present in C / C++, and most memory issues.
- Strong type system prevents [data races](https://doc.rust-lang.org/nomicon/races.html), brings ['fearless concurrency'](https://blog.rust-lang.org/2015/04/10/Fearless-Concurrency.html) (amongst others).
- Seamless C interop, and [dozens of supported platforms](https://doc.rust-lang.org/rustc/platform-support.html) (based on LLVM).
- ["Most loved or admired language"](https://survey.stackoverflow.co/2023/#section-admired-and-desired-programming-scripting-and-markup-languages) for ~~4~~ ~~5~~ ~~6~~ ~~7~~ 8 years in a row. 🤷‍♀️
- Modern tooling: `cargo` (builds _just work_), `clippy` (700+ code quality lints), `rustup` (easy toolchain mgmt).

### Weaknesses

**Points you might run into**

- Steep learning curve;^(1) compiler enforcing (esp. memory) rules that would be "best practices" elsewhere.
- Missing Rust-native libs in some domains, target platforms (esp. embedded), IDE features.^(1)
- Longer compile times than "similar" code in other languages.^(1)
- Careless (use of `unsafe` in) libraries can secretly break safety guarantees.
- ~~No formal language specification~~, [Link](https://spec.ferrocene.dev/) ~~can prevent legal use in some domains (aviation, medical, …)~~. [Link](https://ferrous-systems.com/ferrocene/)
- Rust Foundation may offensively use their IP to affect _'Rust'_ projects (e.g, forbid names, impose policies). [Link](https://devclass.com/2023/04/11/dont-call-it-rust-community-complains-about-draft-trademark-policy-restricting-use-of-word-marks/)[Link](https://web.archive.org/web/20230413161930/https://old.reddit.com/r/rust/comments/12e7tdb/rust_trademark_policy_feedback_form/)^(2)

^(1) Compare [Rust Survey](https://blog.rust-lang.org/2020/04/17/Rust-survey-2019.html#why-not-use-rust).

^(2) Avoiding their marks (e.g, in your name, URL, logo, dress) is probably sufficient.

### Installation

**Download**
- Get installer from [**rustup.rs**](https://rustup.rs/) (highly recommended) **[Useful]**

**IDEs**
- [**Rust Rover**](https://www.jetbrains.com/rust/) (free for non-commercial)
- [Visual Studio Code](https://code.visualstudio.com/) with [**rust-analyzer**](https://rust-analyzer.github.io/) (free)

### First Steps

**Modular Beginner Resources**
- [**Tour of Rust**](https://tourofrust.com/TOC_en.html) - Live code and explanations, side by side.
- [**Rust in Easy English**](https://dhghomon.github.io/easy_rust/Chapter_3.html) - 60+ concepts, simple English, example-driven.
- [**Rust for the Polyglot Programmer**](https://www.chiark.greenend.org.uk/~ianmdlvl/rust-polyglot/index.html) - A guide for the experienced programmer.

In addition consider **The Book**,[Book](https://doc.rust-lang.org/book/) **Rust by Example**,[Rust by Example](https://doc.rust-lang.org/stable/rust-by-example/) the **Standard Library**,[std](https://doc.rust-lang.org/std) and **Learn Rust**.[Link](https://github.com/ImplFerris/LearnRust)

> **Opinion**  **[Opinion]**  — If you have never seen or used any Rust it might be good to visit one of the links above before continuing; the next chapter might feel a bit terse otherwise.

