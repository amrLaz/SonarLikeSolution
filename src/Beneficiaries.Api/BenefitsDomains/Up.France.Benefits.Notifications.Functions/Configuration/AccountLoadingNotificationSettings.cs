namespace Up.France.Benefits.Notifications.Functions
 {
     public class AccountLoadingNotificationSettings
     {
         // Exemple par défaut : 9h30
         public int ScheduleStartHour { get; set; } = 9;
         public int ScheduleStartMinute { get; set; } = 30;
         
         // Plage de lissage en minutes (ex: 60 minutes pour finir à 10h30)
         public int SmoothingWindowMinutes { get; set; } = 60;
         
         public string ConsumerGroup { get; set; }
         
         public string HibName { get; set; }

         public string WhiteListing { get; set; } = null!;
         
         public string TypesOfOrder { get; set; } = null!;
     }
 }