# frozen_string_literal: true

require "active_support/core_ext/integer/time"

Rails.application.configure do
  config.cache_classes = true
  config.eager_load = true

  config.consider_all_requests_local = false

  # Log to stderr and use the default formatter.
  config.log_formatter = ::Logger::Formatter

  # Do not dump after seeding the production database.
  config.active_record.dump_schema_after_migration = false
end
