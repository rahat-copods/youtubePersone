BY BOLT

- Configure CHAT persona INPUT settings with topK and similarityFilter: small settingButton in chat that allows user match this. and pass this values on backend and use them. set default to 0.5 similar and 0.1 topk
- Implement pagination for videos on the settings page.
- PROCESS_EMBEDDING button: processes 100 videos at a time and displays progress of how many captions processed.
- Make CHAT support multiple instances per persona (instead of one), and display them in the sidebar.

BY USER

- Update migration file
- storage flow: user sends message to backend backend streams reponse and once done backend store user and chat message in db
