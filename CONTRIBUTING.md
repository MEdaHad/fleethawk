# Contributing to FleetHawk

Thanks for your interest! Here's how to contribute:

## Quick Start

```bash
git clone https://github.com/MEdaHad/fleethawk.git
cd fleethawk
npm install
npx tsc --noEmit    # type check
npx vitest run      # run tests
```

## Workflow

1. Fork the repo
2. Create a feature branch: `git checkout -b feat/my-feature`
3. Make your changes
4. Run tests: `npx vitest run`
5. Commit with conventional commits: `feat:`, `fix:`, `docs:`, `test:`
6. Open a PR against `main`

## Code Style

- TypeScript strict mode
- No `any` types unless absolutely necessary
- Tests for new features

## License

By contributing, you agree your contributions will be licensed under MIT.
