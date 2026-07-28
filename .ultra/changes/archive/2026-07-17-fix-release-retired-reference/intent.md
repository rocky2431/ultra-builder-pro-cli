# Fix retired-surface release gate regression

- Change: `fix-release-retired-reference`
- Kind: `incident`
- Base commit: `5d2285428188038c4f1c6664ad4860b35c29cd48`
- Documentation impact: `required`

## Intent

Remove the retired command-proxy reference introduced in D53, preserve the no-residue contract, and publish the already completed harness closure through a new immutable patch version.

## Documentation rationale

The package version and release history must accurately record the failed 0.8.0 gate and 0.8.1 recovery.
