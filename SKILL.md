# introduction
- a descriptive language for human
- *.human = spec for human
- *.robot = spec for robot
- each file should have a .human and a .robot of the same filename
- search only under the spec folder

# requirement
- *.human is only to be editable by human
- grill the human if he did something ambiguous or wrong
- say regenerate or regen to review the human spec to generate the robot spec again

# .human defination
- @ prefix = entity
- ? prefix = state
- $ prefix = service
- // prefix = user comment
- # prefix = user requirement statement
- -> = logic flow
- operator == can means equal semantically or literally, robot decide
- + operator means combine the behavior into a set
- child or attributes is defined by - , composition is allowed
- a single word that does not have prefix or quotes are behavioural functionality or attributes name


# .robot defination
- create if not found
- for agent to write the proper spec before implementation
- implemention is based on the description of human tokens semantically
- *.robot is a more detailed *.human for human to read so make it concise
- use same formatting style as .human but more details like a specifications
- make sure all the prefix is followed over
- for each header create a relative path to point to the correct code line e.g [./example.txt][16]
- ask human to review *.robot before implementation
- changes should be made in .human, .robot can never be edited by human
- give suggestion on how to edit the *.human file
- give option to read *.human to regenerate the *.robot