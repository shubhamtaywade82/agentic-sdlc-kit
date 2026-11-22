# frozen_string_literal: true

# spec/rails_helper.rb — boots Rails for the spec suite. Required by every
# spec that needs the application (model, request, system specs).
require "spec_helper"
ENV["RAILS_ENV"] ||= "test"
require_relative "../config/environment"

abort("The Rails environment is running in production mode!") if Rails.env.production?

require "rspec/rails"

# Abort on pending migrations so a missing db:prepare surfaces loudly
# instead of a confusing table-not-found error mid-spec.
begin
  ActiveRecord::Migration.maintain_test_schema!
rescue ActiveRecord::PendingMigrationError => e
  abort e.to_s.strip
end

RSpec.configure do |config|
  config.use_transactional_fixtures = true
  config.infer_spec_type_from_file_location!
  config.filter_rails_from_backtrace!
end
