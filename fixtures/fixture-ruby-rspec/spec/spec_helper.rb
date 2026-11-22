# frozen_string_literal: true

# fixture-ruby-rspec/spec/spec_helper.rb
#
# Minimal, conventional RSpec configuration for the plain-Ruby fixture.
# Adds lib/ to the load path so specs can `require "widget"`.
$LOAD_PATH.unshift(File.expand_path("../lib", __dir__))

RSpec.configure do |config|
  config.expect_with :rspec do |expectations|
    expectations.include_chain_clauses_in_custom_matcher_descriptions = true
  end

  config.mock_with :rspec do |mocks|
    mocks.verify_partial_doubles = true
  end

  config.shared_context_metadata_behavior = :apply_to_host_groups
end
