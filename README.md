# Project 9: L'Oréal Routine Builder
L’Oréal is expanding what’s possible with AI, and now your chatbot is getting smarter. This week, you’ll upgrade it into a product-aware routine builder. 

Users will be able to browse real L’Oréal brand products, select the ones they want, and generate a personalized routine using AI. They can also ask follow-up questions about their routine—just like chatting with a real advisor.

## Run the project

From the project folder, run `python3 -m http.server 8000` and open
`http://localhost:8000`. Serving the page over HTTP lets it load
`products.json`. Search and category filters work together. Product choices
are saved in this browser and restored on reload.

## Connect the advisor

Set `workerUrl` at the top of `script.js` to the class-hosted Cloudflare
Worker URL or your existing assignment Worker URL. The starter archive did
not include a live URL. The Worker must allow requests from your preview
and deployed site origins, accept a JSON POST with a `messages` array,
and return the reply in `choices[0].message.content`. The OpenAI key is
managed on the Worker.

Generate Routine starts a new conversation with the products selected at that
moment. Each follow-up sends the conversation so far to the Worker. Generate
again when you want the conversation to use a different selection.

## Extra credit

Product keyword search and the right-to-left layout switch are ready to try.
For web search, the Worker needs a search-capable OpenAI configuration.
A Worker that returns Chat Completions URL annotations in
`choices[0].message.annotations` enables clickable inline citations.
For a Worker using the Responses API, adapt its text and
`url_citation` annotations to that same reply shape.
See [OpenAI's web search guide](https://developers.openai.com/api/docs/guides/tools-web-search).

## Submission check

With the live Worker connected, generate a routine and ask a follow-up.
Check that unrelated questions are redirected, and verify citations if web
search is enabled. Test selection, reload, search, and right-to-left layout
at desktop and phone widths. Commit and push the project to your assignment
repository, deploy it, and verify the live URL in a private browser.
