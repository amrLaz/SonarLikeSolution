using Microsoft.AspNetCore.Mvc;
using Microsoft.Azure.Cosmos;


namespace Up.France.Benefits.Api.Controllers
{
    [ApiController]
    public class EventsController : Controller
    {
        private CosmosClient _client;
        //private IEventService _eventService;

        //public EventsController()
        //{
        //    //_eventService = eventService;
        //}

        //[HttpGet]
        //[Route("/operations/{operation_id}/events")]
        //public async Task<IEnumerable<Events>> Get(string operation_id, [FromHeader] string? continuationToken, int? pageSize = 10)
        //{
        //    //IEnumerable<Events> events = await _eventService.GetAllEventsAsync();
        //    //return events;
        //}
        //[SwaggerOperation(Summary = "Write your summary here")]
        //[HttpPost]
        //[Route("/events/multiple-accounts")]
        //public async Task<IEnumerable<Events>> Post([FromHeader] string? continuationToken, int? pageSize = 10)
        //{
        //    //IEnumerable<Events> events = await _eventService.GetAllEventsAsync();
        //    //return events;
        //}
    }
}
