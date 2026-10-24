fn main() {
    if std::env::var("CARGO_CFG_TARGET_OS").as_deref() == Ok("windows") {
        let mut res = winresource::WindowsResource::new();
        res.set("FileDescription", "Helix Fetch");
        res.set("ProductName", "Helix");
        res.set("InternalName", "Helix Fetch");
        res.set("OriginalFilename", "helix-fetch.exe");
        res.compile().expect("embed Windows version resource");
    }
}