# frozen_string_literal: true

# Filter sensitive parameters from the log file.
Rails.application.config.filter_parameters += [:password, :secret, :token]
