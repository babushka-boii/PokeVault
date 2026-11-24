"""Pure pocket rules: capacity, next free pocket and visible pages."""

MAX_PAGES = 40
POCKETS_PER_PAGE = 9
CAPACITY = MAX_PAGES * POCKETS_PER_PAGE


def next_free(occupied: set[tuple[int, int]]) -> tuple[int, int] | None:
    """Lowest free (page, pocket), filling each page before the next; None when full."""
    for page in range(1, MAX_PAGES + 1):
        for pocket in range(1, POCKETS_PER_PAGE + 1):
            if (page, pocket) not in occupied:
                return page, pocket
    return None


def visible_pages(max_page: int | None) -> int:
    """Pages shown: the last used page plus one spare, in whole two-page spreads."""
    wanted = 1 if max_page is None else max_page + 1
    spreads = -(-wanted // 2)
    return min(MAX_PAGES, max(2, spreads * 2))
