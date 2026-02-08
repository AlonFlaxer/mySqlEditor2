s repo is a an app to manage sql ,   
it is GUI based on WEB to manage connected sql datasource
base on node express bootstrap jquery 
the ui is with browser
on the main menu the user sees
this setup:

menu--------------------
| v   | command pane   |
| e   |                |
| r   |                |
| t   |----------------|
| i   | result pane    |
| c   |                |
| a   |                |
| k   |                |
-----------------------


on vertical pane , users see tree view  of connected schema-> table -> columns and types : name (t) | type can be i for integer s for string ... and son on 
on comman pane user can enter sql commands
on result  pane user can see a table woith command result

on menu user has connect entry 
whe modal pop up  is show where user can manage connectiosn , 
the connections are sotred on local yml files

the connection type can be sqlite, mysql, dynamoDB and more
the app run on port 3010


