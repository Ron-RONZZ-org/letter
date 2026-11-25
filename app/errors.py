class LetterError(Exception):
    """Base class for letter-service errors."""


class RenderError(LetterError):
    """Typst rendering failed."""


class BusyError(LetterError):
    """Too many concurrent render jobs."""
