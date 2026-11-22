# Engineering notes — fixture-ruby-rspec

This file documents existing engineering conventions in the fixture. It
exists so the kit's M2 discovery can demonstrate that it preserves existing
documentation rather than overwriting it.

## Public surface

| Class   | Method        | Behavior                                       |
| ------- | ------------- | ---------------------------------------------- |
| Widget  | `#name`       | Returns the stripped name                      |
| Widget  | `.new(name:)` | Raises `ArgumentError` if name is nil or blank |

## Decisions

- Plain Ruby (no Rails) so `bundle exec rspec` boots with no database and
  no network, keeping the CI lane cheap and deterministic.
- RSpec `~> 3.13`; `--format documentation` for readable, classifier-stable
  failure output (`Failure/Error:` blocks and the `N examples, M failures`
  summary line the kit's verification classifier relies on).
- `lib/` is added to `$LOAD_PATH` in `spec/spec_helper.rb` so specs can
  `require "widget"` without a gemspec.
