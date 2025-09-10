BY BOLT

- the Videos Discovered inditaior or setting page should fetch the total video count from db rather than filter the recived data
- create persona should also take the supabase credentials too store captions and pinecone details to store emmbeddings and store it with persona table encrypted with assymetric way and in the backend should first look for credentials from persona table if not exists then use for env credentials
- add user setting where user can add there apify token and AI model credentials the APIKEY and model(include gemini based grok based openai based models for now user can select and provide apikey)
- message session title should be the first user message and also make it editable if user wants to edit title

BY USER

- Update migration file
- storage flow: user sends message to backend backend streams reponse and once done backend store user and chat message in db
- check cron jobs
