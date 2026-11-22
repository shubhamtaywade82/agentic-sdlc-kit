# frozen_string_literal: true

# config/environments/test.rb — minimal test environment. Only references
# frameworks actually loaded (active_record, action_controller, active_support).
require "active_support/core_ext/integer/time"

Rails.application.configure do
  config.cache_classes = true
  config.eager_load = false

  # Show full error reports and disable caching.
  config.consider_all_requests_local = true
  config.action_controller.perform_caching = false
  config.cache_store = :null_store

  # Render exception stack traces in tests instead of public error pages.
  config.action_dispatch.show_exceptions = :none

  # Disable request forgery protection in test environment.
  config.action_controller.allow_forgery_protection = false

  # Print deprecation notices to stderr.
  config.active_support.deprecation = :stderr
end
