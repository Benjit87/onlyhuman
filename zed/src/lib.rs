// language_server_command: Zed runs `onlyhuman lsp` over stdio, the same server the vscode client starts.
use zed_extension_api::{self as zed, LanguageServerId, Result};

struct OnlyHuman;

impl zed::Extension for OnlyHuman {
    fn new() -> Self {
        OnlyHuman
    }

    fn language_server_command(
        &mut self,
        _language_server_id: &LanguageServerId,
        worktree: &zed::Worktree,
    ) -> Result<zed::Command> {
        let command = worktree
            .which("onlyhuman")
            .ok_or_else(|| "onlyhuman is not on PATH, install it with: npm i -g onlyhuman".to_string())?;
        Ok(zed::Command {
            command,
            args: vec!["lsp".to_string()],
            env: worktree.shell_env(),
        })
    }
}

zed::register_extension!(OnlyHuman);
