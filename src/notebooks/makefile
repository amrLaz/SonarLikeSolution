.DEFAULT_GOAL := start

.PHONY: check Formatting
format:
	black . --check --diff --color

.PHONY: test
test:
	python -m unittest discover -p "*_tests.py"

.PHONY: lint
lint:
	python -m flake8 --config=.flake8

.PHONY: setup
setup:
	pip install .

.PHONY: setup-all
setup-all:
	pip install .[dev,test] && pip install -e .

.PHONY: setup-all-ci
setup-all-ci:
	pip install .[dev,test] --cache-dir ./.pipcache && pip install -e . --cache-dir ./.pipcache