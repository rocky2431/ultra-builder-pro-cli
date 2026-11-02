
## REQ-stats Totals at a glance
`GET /api/stats` answers 200 with `{"links": <number of links>, "clicks": <total clicks of
all links>, "expired": <number of links that have expired>}`. The web page shows the same
three numbers, each as the text of an element carrying `data-total-links`,
`data-total-clicks` and `data-total-expired`, for example `<b data-total-clicks>3</b>`.
Done when: I open the page and see how many links there are and how often they were opened.
