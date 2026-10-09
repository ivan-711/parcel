"""Print the OpenAPI schema, for generating the web client's types."""

import json
import sys

from parcel.app import create_app

if __name__ == "__main__":
    json.dump(create_app().openapi(), sys.stdout, indent=1)
