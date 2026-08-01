# Export syntax lookup

Use this table to collect candidates, then confirm public reachability through the
repository's build system, framework registration and non-test consumers. Text matches
are observations, not semantic proof.

| Language | Candidate forms to search |
|---|---|
| TypeScript / JavaScript | `export function`, `export class`, `export const`, `export { name }`, `module.exports`, `exports.name` |
| Python | top-level `def` and `class`, names in `__all__`, public package re-exports; exclude leading-underscore names unless explicitly exported |
| Go | package-level identifiers beginning with an uppercase letter |
| Rust | `pub fn`, `pub struct`, `pub enum`, `pub trait`, `pub use`; respect module visibility such as `pub(crate)` |
| Java | `public` top-level types and public members reachable through the package's exposed API |

For every candidate changed by the current Change, search the exact symbol in non-test
source. Zero references is an orphan candidate. Before recording it, check declarative
framework entry points, reflection, dependency injection, generated code and foreign-
function bindings that may consume the symbol without a textual import.
