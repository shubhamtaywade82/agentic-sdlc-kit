# frozen_string_literal: true

# Standard Rails config.ru. Not exercised by the RSpec suite, but present so
# the fixture mirrors a real Rails API application.
require_relative "config/environment"
run Rails.application
Rails.application.load_server
