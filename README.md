# onlyhuman

onlyhuman is a descriptive language for specs. You write intent in plain bullets, and a handful of prefixes (`@` service, `$` entity, `?` state, `%` method, `#` requirement) mark the structure. The robot reads your meaning, not your formatting.

onlyhuman is just a light syntax for writing your intent. Stop chatting, start writing your own context.

It takes you from your intent to an implementation plan to code, and every step is traceable and pointable. Your intent lives in `*.human`. The robot (your AI agent) turns it into a detailed implementation plan in `*.bot`. Each header in the plan points to the code line that implements it, and go-to-definition follows that chain from intent to plan to code.

## Example

`spec/orders.human`, written by you:

```
#checkout
- a customer can pay for a basket

$Order
- items
- total

?Paid
- true once payment is confirmed

@Checkout
- $Order -> charge -> ?Paid
- %charge
  - rejects an empty basket
```

The robot writes `spec/orders.bot` from it. In the `.bot`, each header ends with a pointer to its code, for example `@Checkout [./src/checkout.ts][12]`.

## Install

Save the example above as `spec/orders.human`, then:

```bash
npm install onlyhuman
npx onlyhuman lint spec/orders.human
```

Add the skill to your project so the robot knows the rules:

```bash
npx onlyhuman skill init
```

or, with the skills CLI:

```bash
npx skills add benjit87/onlyhuman
```

For editor highlighting, linting and go-to-definition, install the VS Code extension from a clone of this repo with `cd vscode && ./install-local.sh`. See [doc/DETAILS.md](doc/DETAILS.md) for the full syntax, CLI and editor details.
