# D1 profile

The app uses Drizzle ORM with Cloudflare D1. Run `bun db:migrate` after `bun setup` before using the sample persistence route. Migration generation is available through `bun db:generate`.

Local state is stored in the repository's ignored `.wrangler/state` directory. Preview and Production migrations require an explicit environment target and should only be run deliberately.
