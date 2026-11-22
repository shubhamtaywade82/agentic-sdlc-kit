# frozen_string_literal: true

require "active_support/core_ext/integer/time"

Rails.application.configure do
  config.cache_classes = false
  config.eager_load = false

  config.consider_all_requests_local = true

  # Print deprecation notices to the logger.
  config.active_support.deprecation = :log

  # Annotate rendered view with file names.
  # config.action_view.annotate_rendered_view_with_filenames = true
end
