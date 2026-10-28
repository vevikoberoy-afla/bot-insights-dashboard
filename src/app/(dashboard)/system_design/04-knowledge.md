# Knowledge base dashboard

## Pages

- `/knowledge/all` lists client datasets, search/filter, status, chunk count, bot assignments and delete actions. It loads `/api/datasets?client_id=…`.
- `/knowledge/add` creates a dataset and attaches sources through the same dataset APIs.
- `/knowledge/[id]` is the detail editor: dataset metadata, source list, chunk list, source add/delete/test, chunk deletion, bot linking/unlinking and retrieval test.
- `/knowledge/analytics` currently renders `ComingSoon` even though analytics APIs exist elsewhere.

## Data flow

`datasets → dataset_sources → chunks/embeddings → bot_datasets → chat retrieval`.

The detail page calls `/api/chunks?dataset_id=…`, `/api/datasets/[id]/sources`, `/api/datasets/[id]/bots`, and `/api/datasets/[id]/test`. Upload/crawl processing can be asynchronous; the UI refreshes status/chunk counts after mutations.

## Product rules

Manual FAQ entries are managed as ordinary chunks through `BotFaqManager` in the bot editor. Retrieval and live source answers are not the same data path: knowledge chunks answer stable policy/content questions, while `/databases` sources answer current orders, inventory and account records.
