# frozen_string_literal: true

# config/application.rb — minimal Rails 8 API application.
#
# Only the railties the fixture needs are required (active_record for the
# model, action_controller/action_view for ActionController::API). The
# heavier frameworks (active_storage, action_cable, action_mailer,
# action_mailbox, action_text, active_job, rails/test_unit) are intentionally
# NOT loaded, so no storage.yml / action-cable / mailer config is required
# and the app boots against a single sqlite database with no extra files.
require_relative "boot"
require "rails"
require "active_model/railtie"
require "active_record/railtie"
require "action_controller/railtie"
require "action_view/railtie"

Bundler.require(*Rails.groups)

module FixtureRailsApi
  class Application < Rails::Application
    config.load_defaults 8.0
    config.api_only = true
  end
end
