---
name: onlyhuman
description: "Write and maintain onlyhuman specs, a descriptive language where the human writes *.human (intent, human-edited only) and the agent writes the matching *.bot (detailed spec) under the spec folder. Also initialize a project SKILL.md at .onlyhuman/SKILL.md. Use when the user mentions *.human or *.bot files, says regenerate or regen, wants a spec written and reviewed before implementation, or wants to initialize a project skill."
---

# introduction
- a descriptive language for human
- *.human = spec for human
- *.bot = spec for robot
- each file should have a .human and a .bot of the same filename
- search only under the spec folder

# requirement
- *.human is only to be editable by human
- grill the human if he did something ambiguous or wrong
  - ask before generating, if the human says go ahead anyway list the assumptions at the end of the .bot
- say regenerate or regen to review the human spec to generate the robot spec again
- say approve to implement the spec

# .human definition
- @ prefix = service
- ? prefix = state
- $ prefix = entity
- "//" prefix = user comment, can be a note or an instruction
- # prefix = user requirement statement
- "->" = logic flow
- operator == can mean equal semantically or literally, robot decide
- "+" operator means combine the behavior into a set
- a leading `-` marks a child of the previous item; indent by 2 spaces for each deeper level
- indent is 2 spaces only, error if not
- a line with no - must start with a prefix
- a single word that does not have prefix or quotes is a behavioural functionality or attributes name
- to write a double slash as a plain word, quote it e.g "//"
- a line that is only one operator is a listing, not an expression
- a placeholder like "$Name" is quoted so it is not read as a symbol

# .bot definition
- % prefix = allowed in child to represent method or additional details
- use % to provide relevant method defination to code for human to understand
- create if not found
- for agent to write the proper spec before implementation
- implementation is based on the description of human tokens semantically
- *.bot is a more detailed *.human for human to read so make it concise
- use same formatting style as .human but more details like a specification
- make sure all the prefix is followed over
- for each prefix create relevant relative path to point to the correct code line e.g [./example.txt][16]
  - path is relative to the nearest folder that holds .git or SKILL.md
  - update the line numbers after coding
- list assumptions at the end of the .bot when the .human left something open
- lint the .bot before showing it, it must pass like a .human
- ask human to review *.bot before implementation
- changes should be made in .human, .bot can never be edited by human
- give suggestion on how to edit the *.human file, with the exact lines to add
- give option to read *.human to regenerate the *.bot
- never delete a file without asking

# tools
- install with `npm i onlyhuman` in the project
  - run with `npx onlyhuman`
  - use `npm i -g onlyhuman` instead for a global `onlyhuman` command
- `npx onlyhuman skill init [directory] [--force]` // copy ./SKILL.md to .onlyhuman/SKILL.md
- `npx onlyhuman lint <file>` // *.human or *.bot
- `npx onlyhuman def <name> <file>`
- `npx onlyhuman def <file>:<line>:<col>`
