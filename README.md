# onlyhuman

**TL;DR**
- You write intent as short bullets in `spec.human`. Only you edit it.
- A robot (an AI agent) turns it into a detailed `spec.bot` for you to review, then into code.
- The syntax fixes only structure (`@ ? $`, `-`, `->`); the meaning of each line is decided semantically by the reader.
- Goals: trace every line of code back to a line you wrote, and make you record the spec before building.
- Tools: a linter, go-to-definition (human, bot, code) and highlighting, as a CLI and a VS Code extension.

A descriptive language for writing specs in plain bullets. The syntax is light on purpose: it fixes the structure of a line and leaves the meaning to the reader.

Every spec comes as a pair of files with the same name:

| File | Written by | Purpose |
|---|---|---|
| `spec.human` | you, only | the intent, in short bullets |
| `spec.bot` | the robot (an AI agent) | the same spec in more detail, for you to review before any code is written |

## Key objectives

1. **Lineage from human to robot to code.** Every piece of code should trace back to a line you wrote. A definition header in `spec.human` leads to the same header in `spec.bot`, and that header carries a `[path][line]` pointer to the code that implements it. You can follow the chain in the editor with go-to-definition, and the linter warns when a pointer is broken (`broken-pointer`), when a spec has no partner file (`missing-robot`, `missing-human`), or when a definition is never used (`unused-definition`).
2. **Discipline the user to record the spec.** Intent lives in `spec.human`, and nowhere else. You are the only one who edits it, and a change to behaviour is made there, then regenerated into `spec.bot`, then reviewed, and only then built. The robot is told to ask you when something is ambiguous or wrong, so a vague line is questioned before it becomes code.

What the tools do not check: the lineage is only as good as the pointers. The linter confirms that a pointer's file exists and that the line is inside it, not that the code at that line does what the `.bot` says. Keeping `.human` honest is still your job.

## The idea: semantically driven syntax

In most languages the compiler fixes both the grammar and the meaning. Here the grammar is small and fixed, so code can check it. The meaning is decided semantically by the reader, which is the robot.

| Fixed by the syntax | Decided by the reader |
|---|---|
| `@` service, `?` state, `$` entity | what that entity, state or service is in the product |
| a leading `-` makes a child, indent is 2 spaces | whether a child is an attribute, a step or a part |
| `->` flow, `+` combine | what the flow or combination does |
| `==` | equal semantically or literally, the robot decides |
| `//` starts a comment | whether the comment is a note or an instruction |
| any other word | a method, a behaviour, or just a sentence |

Example:

```
@Parser
- $Data -> tokenize -> $Tokens
```

The tools know `@Parser` is a service, `$Data` and `$Tokens` are entities, and `->` is a flow. They do not know what `tokenize` means. The robot reads it as a behaviour and works out what it should do. A line such as `- define for me` is a valid spec line for the same reason: it is a sentence, and the robot fills it in.

### What this costs

- Two readers can understand a line differently, so the result is not guaranteed to be the same every time.
- The linter catches structural mistakes, such as an undefined `$Name`. It cannot tell you that a line means the wrong thing.

Two rules keep this under control. The robot must ask you when a line is ambiguous or wrong, and you review `spec.bot` before any implementation starts.

## Syntax

| Syntax | Meaning |
|---|---|
| `@Name` | service |
| `?Name` | state |
| `$Name` | entity |
| `#text` | requirement statement |
| `// text` | comment, from `//` to the end of the line; a note or an instruction |
| `-` | starts a child of the previous header, any depth |
| `->` | logic flow |
| `+` | combine behaviours into a set |
| `==` | equal, semantically or literally |
| bare word | behaviour or attribute name |

Rules:
- A line with no `-` is a header and must start with a prefix (`@ $ ? # //`).
- Indent is 2 spaces. A tab or an odd indent is an error.
- A `//` is a comment only when it starts a space-separated word. `"//"`, `a//b` and `\//` are plain words.
- In a `.bot`, a header may end with a pointer to code: `$Token [./src/types.ts][14]`. The path is relative to the nearest folder that holds `.git`; when there is no `.git`, it is relative to the parent of the `spec/` folder.

The full rules, including how the robot behaves, are in [onlyhuman-skill/SKILL.md](onlyhuman-skill/SKILL.md). The spec for this tool is in [spec/spec.human](spec/spec.human).

## Workflow

1. Edit `spec/spec.human`. Only you edit `.human` files.
2. Say "regenerate". The robot rewrites `spec/spec.bot` from your spec.
3. Review `spec.bot`. Change your intent in `spec.human`, never in `spec.bot`.
4. Approve, and the robot implements against the reviewed `spec.bot`.

## Tools

The parser, linter, go-to-definition and highlighter work on both `.human` and `.bot` files. Development requires Node 22.18 or newer; the published CLI bundle targets Node 20 or newer.

```bash
npm install
npm test
```

For the published CLI:

```bash
npm install --global onlyhuman
onlyhuman lint spec/spec.human
```

Initialize a project skill:

```bash
onlyhuman skill init
```

This copies the library's `onlyhuman-skill/SKILL.md` into `<directory>/onlyhuman-skill/SKILL.md`; add `--force` to overwrite an existing file.

Lint a file. This prints `file:line:col severity rule message` and exits 1 on errors:

```bash
node src/cli.ts lint spec/spec.human
```

Find a definition, by name or by cursor position (1-based line and column):

```bash
node src/cli.ts def '$Token' spec/spec.human
node src/cli.ts def spec/spec.human:15:2
```

- From a definition header in a `.human`, go-to-definition jumps to the same header in the sibling `.bot`.
- From a definition header in a `.bot`, it jumps to the code line in its `[path][line]`.
- A reference jumps to its header in the same file.

- An `import <file>.human` line (bare, or as a child `- import <file>.human`) makes every definition of that spec under `spec/` count as defined here. The cursor on the file name opens that file, and a reference to an imported name jumps to its header there. Imports are one level only. A line with anything else after the file name, or a `*` in it, is plain text, not an import.

Lint rules: `no-prefix`, `orphan-child`, `bad-indent`, `indent-jump`, `repeated-bullet`, `consecutive-header`, `undefined-reference`, `duplicate-definition`, `dangling-operator`, `unresolved-import` (errors), and `unused-definition`, `missing-robot`, `missing-human`, `broken-pointer` (warnings).

### VS Code

The extension in `vscode/` gives you the same linting and go-to-definition in the editor, plus colours. Install its dependency, then open a window with it loaded:

```bash
cd vscode && npm install
code --extensionDevelopmentPath=/path/to/onlyhuman/vscode /path/to/onlyhuman/spec
```

## Layout

| Path | Contents |
|---|---|
| `src/tokenizer.ts`, `src/parser.ts`, `src/types.ts` | text to tokens to a tree of nodes |
| `src/linter.ts` | lint rules |
| `src/definition.ts` | go-to-definition and `[path][line]` pointers |
| `src/files.ts` | the only file-system access: sibling file and project root |
| `src/cli.ts`, `src/lsp/server.ts` | command line and language server |
| `src/skill.ts` | copies `onlyhuman-skill/SKILL.md` into the target project |
| `onlyhuman-skill/` | the skill shipped with the package |
| `npm.sh` | build, verify and publish the CLI package |
| `LICENSE` | MIT license |
| `vscode/` | editor client and highlighting grammars |
| `tests/` | unit tests |
| `spec/` | the project's own `spec.human` and `spec.bot` |

## Limits

- Go-to-definition covers one file and its sibling only, with no cross-file lookup.
- The VS Code extension has been run in a development window only, not packaged.
- The `.bot` extension is a choice made to avoid clashing with Robot Framework's `.robot`.
