# frozen_string_literal: true

# API-only base controller. Inherits ActionController::API because
# config.api_only = true in config/application.rb.
class ApplicationController < ActionController::API
end
