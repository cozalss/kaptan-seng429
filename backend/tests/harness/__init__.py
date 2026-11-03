"""The test harness: recorded fixture day, replay LLM, tamper helper, fixed clock. Tests only.

Nothing under `src/kaptan` imports this package and the image does not copy `tests/`, so none of it can run in a
product: there is no setting that turns it on. A test opts in by calling it directly (see tests/conftest.py).
"""
