import { bootstrapApplication } from '@angular/platform-browser';
import { provideAnimations } from '@angular/platform-browser/animations';
import { AppComponent } from './app/app.component';
import { loadFooterAdsWhenReady } from './load-footer-ads';

bootstrapApplication(AppComponent, {
  providers: [
    provideAnimations()
  ]
})
  .then(() => loadFooterAdsWhenReady())
  .catch(err => console.error(err));
