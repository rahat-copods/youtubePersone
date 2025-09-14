BY BOLT

- the Videos Discovered inditaior or setting page should fetch the total video count from db rather than filter the recived data
- message session title should be the first user message and also make it editable if user wants to edit title
- storage flow: user sends message to backend backend streams reponse and once done backend store user and chat message in db, and over client side when user sends message we update statevariable to include user message and when server sends response we update stateVariable and no interaction with the db. only interaction with db when refreshed or opened chatSession at that time fetch chats from db and store in state variable
✅ pricing tiers :
  ✅ free: no private/public persona creation, 50 message limit perweek
  ✅ Starter: $5*12/year or $7/month - 2000 query/month - 5 persona creation 2 private persona
  ✅ Pro: 10*12 /year or $14/month - 5000 query/month - 15 persona creation in total persona (public + private)
  ✅ NOTE: add a cap limit of 1GB storage limit for per persona in logic
  ✅ NOTE: Private persona is persona created using custom videos rather than just videos from same channels and are also capped at 1GB but can increased by paying $0.3/GB
  ✅ NOTE: user Billing should be adjusted for extra storage as well as the private persona logic needs implementation
✅ cron jobs for processing persona automatically - implemented with job chaining
✅ priority boost feature for faster processing with test payment

BY USER

- Update migration file
